# AWS GitHub action trigger

This simple go project is intended to trigger GitHub actions from AWS Lambda service.

1. Build and zip code:
    ```sh
    GOOS=linux go build main.go
    zip function.zip main
    ```

1. Create new AWS (go) lambda function and upload code as zip: `function.zip`
1. Set up lambda function trigger (SNS notification)
1. Configure environment variables:
    * `PAT`: personal access token for GitHub
    * `DISPATCH_URL`: GitHub dispatch url e.g. `https://api.github.com/repos/findy-network/findy-agent-infra/dispatches`