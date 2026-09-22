const core = require('@actions/core');
const exec = require('@actions/exec');
const github = require('@actions/github');
const os = require('os');
const fs = require('fs');
const axios = require('axios');

async function validateSubscription() {
  let repoPrivate;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (eventPath && fs.existsSync(eventPath)) {
    const payload = JSON.parse(fs.readFileSync(eventPath, "utf8"));
    repoPrivate = payload?.repository?.private;
  }

  const upstream = 'chick-fil-a/gha-docker-run';
  const action = process.env.GITHUB_ACTION_REPOSITORY;
  const docsUrl = 'https://docs.stepsecurity.io/actions/stepsecurity-maintained-actions';
  core.info('');
  core.info('\u001b[1;36mStepSecurity Maintained Action\u001b[0m');
  core.info(`Secure drop-in replacement for ${upstream}`);
  if (repoPrivate === false) core.info('\u001b[32m✓ Free for public repositories\u001b[0m');
  core.info(`\u001b[36mLearn more:\u001b[0m ${docsUrl}`);
  core.info('');
  if (repoPrivate === false) return;
  const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com';
  const body = { action: action || '' };
  if (serverUrl !== 'https://github.com') body.ghes_server = serverUrl;
  try {
    await axios.post(
      `https://agent.api.stepsecurity.io/v1/github/${process.env.GITHUB_REPOSITORY}/actions/maintained-actions-subscription`,
      body, { timeout: 3000 }
    );
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 403) {
      core.error(`\u001b[1;31mThis action requires a StepSecurity subscription for private repositories.\u001b[0m`);
      core.error(`\u001b[31mLearn how to enable a subscription: ${docsUrl}\u001b[0m`);
      process.exit(1);
    }
    core.info('Timeout or API not reachable. Continuing to next step.');
  }
}

async function run() {
    try {
        await validateSubscription();

        const workdir = process.env.WORKING_DIRECTORY;
        console.log(workdir);
        if (workdir && workdir !== '.') {
            core.info(`📂 Using ${workdir} as working directory...`);
            process.chdir(workdir);
        }

        const image    = core.getInput('image');
        const commands = core.getInput('run');
        const user     = core.getInput('user');
        const registry = core.getInput('registry');
        const username = core.getInput('username');
        const password = core.getInput('password');
        const env_context = core.getInput('env-context', { required: false }) || null;

        if (password.trim()) {
            core.setSecret(password);
        }

        // --- docker login ---
        core.startGroup('docker login');
        if (username.trim() && password.trim()) {
            // Pass password via stdin to avoid it appearing in process listings.
            const loginArgs = [];
            if (registry.trim()) loginArgs.push(registry.trim());
            loginArgs.push('-u', username, '--password-stdin');
            await exec.exec('docker', ['login', ...loginArgs], {
                input: Buffer.from(password)
            });
        } else {
            console.log('Username and password not provided. Skipping "docker login" step.');
        }
        core.endGroup();

        // --- docker run ---
        core.startGroup('docker run');

        // Build the args array so user-supplied values cannot inject extra flags.
        const runArgs = [
            'run', '--rm',
            ...getDockerEnvArgs(process.env, env_context),
            '--workdir', '/github/workspace',
            '-v', `${process.cwd()}:/github/workspace`,
            '-v', '/var/run/docker.sock:/var/run/docker.sock'
        ];

        if (fs.existsSync(os.homedir() + '/.m2/settings.xml') &&
            fs.existsSync(os.homedir() + '/.m2/settings-security.xml')) {
            runArgs.push('-v', `${os.homedir()}/.m2:/root/.m2`);
        }

        if (user.trim()) {
            runArgs.push('--user', user.trim());
        }

        if (commands) {
            runArgs.push('--entrypoint', '/bin/bash');
        }

        if (image.trim()) {
            runArgs.push(image.trim());
        }

        if (commands.trim()) {
            // writeFileSync so the file is guaranteed to exist before docker starts.
            fs.writeFileSync('docker_commands.sh', commands);
            runArgs.push('./docker_commands.sh');
        }

        await exec.exec('docker', runArgs);
        await exec.exec('rm', ['-rf', 'docker_commands.sh']);
        core.endGroup();

        // --- fix permissions ---
        core.startGroup('fixing permissions');
        if (os.userInfo().username === 'actions') {
            await exec.exec('sudo', ['chown', '-R', 'actions:actions', '.']);
        }
        if (os.userInfo().username === 'runner') {
            await exec.exec('sudo', ['chown', '-R', 'runner:docker', '.']);
        }
        core.endGroup();

    } catch (error) {
        core.setFailed(error.message);
    }
}

// Returns a flat args array: ['-e', 'KEY=VALUE', '-e', 'KEY2=VALUE2', ...]
// Passing key and value as separate array entries means they are never parsed
// by a shell or a quote-aware tokeniser, which eliminates argument injection.
function getDockerEnvArgs(system_env, workflow_env) {
    const args = [];
    for (const key in system_env) {
        if (system_env[key].trim() && key.includes('GITHUB_')) {
            args.push('-e', `${key}=${system_env[key].replace(/\n/g, '\\n')}`);
        }
    }
    if (workflow_env) {
        const parsed = JSON.parse(workflow_env);
        for (const key in parsed) {
            if (parsed[key].trim()) {
                args.push('-e', `${key}=${parsed[key].replace(/\n/g, '\\n')}`);
            }
        }
    }
    return args;
}

run();
