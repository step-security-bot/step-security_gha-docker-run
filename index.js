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
  if (repoPrivate === false) core.info('\u001b[32m\u2713 Free for public repositories\u001b[0m');
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

        const workdir = process.env.WORKING_DIRECTORY

        console.log(workdir)
        if (workdir && workdir !== '.') {
            core.info(`📂 Using ${workdir} as working directory...`);
            process.chdir(workdir);
        }

        const image = core.getInput('image');
        const commands = core.getInput('run');
        const user = core.getInput('user');
        const registry = core.getInput('registry');
        const username = core.getInput('username');
        const password = core.getInput('password');
        const env_context = core.getInput('env-context', { required: false }) || null;


        if (!!password.trim()) {
            core.setSecret(password)
        }

        core.startGroup('docker login');
        var login_cmd;
        if (!!username.trim() && !!password.trim()) {
            if (!!registry.trim()) {
                login_cmd=(`docker login ${registry} -u ${username} -p ${password}`);
            } else {
                login_cmd=(`docker login ${registry} -u ${username} -p ${password}`);
            }
            await exec.exec(login_cmd)
        } else {
            console.log('Username and password not provided. Skipping "docker login" step.')
        }
        core.endGroup()

        core.startGroup('docker run');
        var run_cmd;
        run_cmd=`docker run --rm ${setDockerEnvVars(process.env, env_context)} --workdir /github/workspace -v ${process.cwd()}:/github/workspace -v /var/run/docker.sock:/var/run/docker.sock`;
        if(fs.existsSync(os.homedir()+"/.m2/settings.xml") && fs.existsSync(os.homedir()+"/.m2/settings-security.xml")) {
            run_cmd=`${run_cmd} -v ${os.homedir()}/.m2:/root/.m2`
        }
        if (!!user.trim()) {
            run_cmd=`${run_cmd} --user ${user}`
        }
        if (!!commands) {
            run_cmd=`${run_cmd} --entrypoint /bin/bash`
        }
        if (!!image.trim()) {
            run_cmd=`${run_cmd} ${image}`;
        }
        if (!!commands.trim()) {
            fs.writeFile('docker_commands.sh', commands, function (err) {
                if (err) return console.log(err);
            });
            run_cmd=`${run_cmd} ./docker_commands.sh`
        }
        await exec.exec(run_cmd)
        await exec.exec('rm -rf docker_commands.sh')
        core.endGroup()

        core.startGroup('fixing permissions');
        // START -> Support for original runner permissions
        if (os.userInfo().username == "actions") {
          await exec.exec("sudo chown -R actions:actions .");
        }
        // END -> Support for original runner permissions
        // START -> 12/7/2020: Support for recent changes to runner user:group permissions
        if (os.userInfo().username == "runner") {
          await exec.exec("sudo chown -R runner:docker .");
        }
        // END -> 12/7/2020: Support for recent changes to runner user:group permissions
        core.endGroup

    } catch (error) {
        core.setFailed(error.message);
    }
}

function setDockerEnvVars(system_env, workflow_env) {
    var env_vars = [];
    for (let i in system_env) {
        if (!!system_env[i].trim() && i.trim().includes("GITHUB_")) {
            env_vars.push(`-e \"${i}=${system_env[i].replace(/\n/g,'\\n')}\"`)
        }
    }
    if (workflow_env) {
        workflow_env = JSON.parse(workflow_env)
        for (let i in workflow_env) {
            if (!!workflow_env[i].trim()) {
                env_vars.push(`-e \"${i}=${workflow_env[i].replace(/\n/g,'\\n')}\"`)
            }
        }
    }
    return env_vars.join(' ')
}

run();
