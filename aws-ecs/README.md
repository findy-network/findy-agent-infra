# Findy Agency deployment to AWS ECS

This cdk script sets up agency to AWS:

- microservice backend auth, vault, core to ECS with load balancer
- pwa wallet app to s3
- cloudfront as proxy to redirect requests from public internet to s3 or load balancer
- pipelines to update agency codes on merge to master

![overview](./docs/arch.png)

**Assumptions:**

- source codes are in GitHub in user owned repositories
- steward is onboarded to ledger and its wallet is exported to file with a known key
- genesis-file is available
- AWS Route53 managed zone

Note! This setup is intended for development time testing scenarios.
Production setup would need another iteration with additional security, high availability and performance considerations in mind. There are some open issues with this setup (see TODO), and most probably those issues will not be solved as the direction for future solutions will be more platform-agnostic.

**TODO:**

- disabling default HTTP listener
- auth/core services lock bolt dbs while execution and thus updates bring currently the whole system down
  NOTE: Due to this `Service Deployment Options` needs to be manually edited:

  ```
     Minimum healthy percent 0
     Maximum percent 100
  ```

- load balancer has performance issues with GRPC-listener TLS termination
- microservice traffic should be routed internally without the need for tls
- reading from EFS file system is slow

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

1. [Create GitHub codestar connection](https://docs.aws.amazon.com/dtconsole/latest/userguide/connections-create-github.html) for triggering automatic version updates.

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

   # github connection arn
   export FINDY_AWS_ECS_GITHUB_CONNECTION_ARN="arn:aws:codestar-connections:us-east-1:xxx:connection/xxx"

   # secret name in secretsmanager (choose freely)
   export FINDY_AWS_ECS_CONFIG_SECRET_NAME="AgencySecrets"

   # steward DID registered to ledger (empty string if not running as steward)
   export FINDY_AWS_ECS_STEWARD_DID="xxx"

   # steward wallet key used in export (empty string if not running as steward)
   export FINDY_AWS_ECS_STEWARD_WALLET_KEY="xxx"

   ```

1. Create folder `.secrets\agent` and add there genesis file: `genesis_transactions` and steward's exported wallet (if running as steward): `steward.exported`

## Steps

```bash
# install deps
npm install

# bootstrap CDK
cdk bootstrap

# save secrets
./store-secrets.sh

# deploy and save cert
./save-cert.sh

# deploy rest of stacks
cdk deploy FindyAgency/Deployment

# use CLI or Console to check values for following and define variables:

# VPC name
export FINDY_AWS_ECS_VPC_NAME=""

# Cluster name
export FINDY_AWS_ECS_CLUSTER_NAME=""

# Service ARN
export FINDY_AWS_ECS_SERVICE_ARN=""

# add deploy step for ECS service
cdk deploy FindyAgency/CIPipeline FindyAgency/ECSDeploy
```

### Useful commands

- `npm run build` compile typescript to js
- `npm run watch` watch for changes and compile
- `npm run test` perform the jest unit tests
- `cdk deploy` deploy this stack to your default AWS account/region
- `cdk diff` compare deployed stack with current state
- `cdk synth` emits the synthesized CloudFormation template
