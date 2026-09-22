[![StepSecurity Maintained Action](https://raw.githubusercontent.com/step-security/maintained-actions-assets/main/assets/maintained-action-banner.png)](https://docs.stepsecurity.io/actions/stepsecurity-maintained-actions)

# gha-docker-run
The `step-security/gha-docker-run` action is used to run a docker container from a private or public registry with the current workspace mapped and github actions env vars available. It also fixes permissions after it runs so that created files are owned by `actions:actions`.

## Usage

This action can be run on any GitHub hosted runners or self-hosted runners as long as `bash` is available as a shell.

```
steps:
  - uses: step-security/gha-docker-run@v1
    with: 
      image: lambci/lambda:build-python3.8
      run: |
        touch testing123.txt
        ls -la
```

## Inputs

Please see details in [action.yaml](action.yml)

## Contributing

Check out our [contributing guidelines](CONTRIBUTING.md)

## License

[Apache License 2.0](LICENSE)
