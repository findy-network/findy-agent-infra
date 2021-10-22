# Findy Agency deployment to AWS ECS

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Prerequisities

1. `cd` to this folder: `cd aws-ecs`

1. Make sure you have installed node.js, AWS CDK and Typescript:

   ```bash
   # node
   nvm install

   # aws cdk
   npm install -g aws-cdk

   # typescript
   npm install -g typescript
   ```

1. You need AWS Account. [Create IAM user and AWS Access keys via console](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html) if you don't them already.

1. [Create a public hosted zone to AWS Route53](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/CreatingHostedZone.html) for your domain. If your domain registrar is different from AWS Route53, you need to store the AWS nameservers to your domain settings (via the domain registrar UI).

1. Declare following environment variables:

   ```bash
   # default region for AWS e.g. eu-north-1
   export AWS_DEFAULT_REGION=<xxx>

   # IAM user access key ID
   export AWS_ACCESS_KEY_ID=<xxx>

   # IAM user secret access key
   export AWS_SECRET_ACCESS_KEY=<xxx>

   # default region for AWS e.g. eu-north-1
   export CDK_DEFAULT_REGION=<xxx>

   # AWS account number
   export CDK_DEFAULT_ACCOUNT=<xxx>

   # domain root (AWS Route53 zone created in previous step)
   export FINDY_AWS_ECS_DOMAIN_ROOT="example.com"

   # desired pwa wallet domain
   export FINDY_AWS_ECS_WALLET_DOMAIN_NAME="agency.example.comm"

   # desired agency api domain
   export FINDY_AWS_ECS_API_DOMAIN_NAME="agency-api.example.com"

   # desired agency api domain
   export FINDY_AWS_ECS_GITHUB_SECRET_NAME="FindyGithubToken"

   export FINDY_AWS_ECS_CONFIG_SECRET_NAME="FindyAgencyInterop"

   export FINDY_AWS_ECS_STEWARD_DID="L3n7arEgYwr1cR5UdHS89k"

   export FINDY_AWS_ECS_STEWARD_WALLET_KEY="3w9D2mYB8DdskMzceuyyzBdGD33DcKcEvs7SQ3hXP925"

   ```

## Steps

```bash
# install deps
npm install

# bootstrap CDK
cdk bootstrap

# deploy CDK
cdk deploy

# Save secrets
# Domain to Route53
# env variables
# .secrets folder
# ./save-cert.sh
# cdk deploy
```

### Useful commands

- `npm run build` compile typescript to js
- `npm run watch` watch for changes and compile
- `npm run test` perform the jest unit tests
- `cdk deploy` deploy this stack to your default AWS account/region
- `cdk diff` compare deployed stack with current state
- `cdk synth` emits the synthesized CloudFormation template
