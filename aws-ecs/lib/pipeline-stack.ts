import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  CodeBuildStep,
  CodePipeline,
  CodePipelineSource,
} from "aws-cdk-lib/pipelines";
import {
  aws_codebuild as codebuild,
  aws_logs as logs,
  CfnOutput,
} from "aws-cdk-lib";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";

import { InfraPipelineStage } from "./pipeline-stage";
import { GRPCPortNumber } from "./constants";
import { NotificationRule } from "aws-cdk-lib/aws-codestarnotifications";
import { Topic } from "aws-cdk-lib/aws-sns";

interface InfraPipelineProperties extends cdk.StackProps { }

const environmentVariables: Record<string, codebuild.BuildEnvironmentVariable> =
{
  DOMAIN_NAME: {
    type: codebuild.BuildEnvironmentVariableType.PARAMETER_STORE,
    value: "/findy-agency/domain-name",
  },
  SUB_DOMAIN_NAME: {
    type: codebuild.BuildEnvironmentVariableType.PARAMETER_STORE,
    value: "/findy-agency/sub-domain-name",
  },
  API_SUB_DOMAIN_NAME: {
    type: codebuild.BuildEnvironmentVariableType.PARAMETER_STORE,
    value: "/findy-agency/api-sub-domain-name",
  },
  GENESIS_TRANSACTIONS: {
    type: codebuild.BuildEnvironmentVariableType.PARAMETER_STORE,
    value: "/findy-agency/genesis",
  },
  ADMIN_ID: {
    type: codebuild.BuildEnvironmentVariableType.SECRETS_MANAGER,
    value: "FindyAgency:findy-agency-admin-id",
  },
  ADMIN_AUTHN_KEY: {
    type: codebuild.BuildEnvironmentVariableType.SECRETS_MANAGER,
    value: "FindyAgency:findy-agency-admin-authn-key",
  },
};

export class InfraPipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: InfraPipelineProperties) {
    super(scope, id, props);

    const githubConnectionArn = StringParameter.valueForStringParameter(
      this,
      "/findy-agency/github-connection-arn"
    );
    const infraInput = CodePipelineSource.connection(
      "findy-network/findy-agent-infra",
      "master",
      {
        connectionArn: githubConnectionArn, // Created using the AWS console
      }
    );
    const frontendInput = CodePipelineSource.connection(
      "findy-network/findy-wallet-pwa",
      "master",
      {
        connectionArn: githubConnectionArn, // Created using the AWS console
      }
    );

    // Create pipeline
    const pipeline = this.createPipeline(
      githubConnectionArn,
      infraInput,
      frontendInput
    );

    // Add app to pipeline
    const deploy = new InfraPipelineStage(this, "Deploy", {
      env: props.env,
    });
    const deployStage = pipeline.addStage(deploy);

    const ecsUpdateStep = this.createECSUpdateStep(
      deploy.clusterName,
      deploy.serviceArn
    );
    deployStage.addPost(ecsUpdateStep);

    // Add frontend build step
    const frontBuildStep = this.createFrontendBuildStep(frontendInput);
    deployStage.addPost(frontBuildStep);

    // Add frontend deploy step
    const frontDeployStep = this.createFrontendDeployStep(
      frontBuildStep.primaryOutput
    );
    deployStage.addPost(frontDeployStep);

    // Add admin onboard
    const adminOnboardStep = this.createAdminOnboardTestStep(
      infraInput,
      ecsUpdateStep.primaryOutput
    );
    deployStage.addPost(adminOnboardStep);

    // Add e2e test
    const e2eTestStep = this.createE2ETestStep(
      frontendInput,
      adminOnboardStep.primaryOutput
    );
    deployStage.addPost(e2eTestStep);

    // need this to add the notification rule
    pipeline.buildPipeline();

    new NotificationRule(this, `FindyAgencyPipelineNotificationRule`, {
      notificationRuleName: `FindyAgencyPipelineNotificationRule${props.env?.region}`,
      source: pipeline.pipeline,
      events: [
        "codepipeline-pipeline-pipeline-execution-failed",
        "codepipeline-pipeline-pipeline-execution-canceled",
        "codepipeline-pipeline-pipeline-execution-started",
        "codepipeline-pipeline-pipeline-execution-resumed",
        "codepipeline-pipeline-pipeline-execution-succeeded",
      ],
      targets: [new Topic(this, "FindyAgencyPipelineNotificationTopic")],
    });

    // manually adjust logs retention
    this.node.findAll().forEach((construct, index) => {
      if (construct instanceof codebuild.Project) {
        new logs.LogRetention(this, `LogRetention${index}`, {
          logGroupName: `/aws/codebuild/${construct.projectName}`,
          retention: logs.RetentionDays.ONE_MONTH,
        });
      }
    });
  }

  createPipeline(
    ghArn: string,
    infraInput: CodePipelineSource,
    frontendInput: CodePipelineSource
  ) {
    const pipeline = new CodePipeline(this, "Pipeline", {
      pipelineName: "FindyAgencyPipeline",
      synth: new CodeBuildStep("SynthStep", {
        input: infraInput,
        additionalInputs: {
          "../findy-wallet-pwa": frontendInput,
          "../findy-agent": CodePipelineSource.connection(
            "findy-network/findy-agent",
            "master",
            {
              connectionArn: ghArn, // Created using the AWS console
            }
          ),
          "../findy-agent-auth": CodePipelineSource.connection(
            "findy-network/findy-agent-auth",
            "master",
            {
              connectionArn: ghArn, // Created using the AWS console
            }
          ),
          "../findy-agent-vault": CodePipelineSource.connection(
            "findy-network/findy-agent-vault",
            "master",
            {
              connectionArn: ghArn, // Created using the AWS console
            }
          ),
        },
        installCommands: ["npm install -g aws-cdk"],
        buildEnvironment: {
          environmentVariables: {
            CDK_CONTEXT_JSON: {
              type: codebuild.BuildEnvironmentVariableType.PARAMETER_STORE,
              value: "/findy-agency/cdk-context",
            },
          },
        },
        commands: [
          "cd aws-ecs",
          `echo "$CDK_CONTEXT_JSON" > cdk.context.json`,
          "cat cdk.context.json",
          "npm ci",
          "npm run build",
          "npx cdk synth",
          "npm run pipeline:context",
        ],
        rolePolicyStatements: [
          new PolicyStatement({
            actions: ["ssm:PutParameter"],
            resources: [
              `arn:aws:ssm:${this.region}:${this.account}:parameter/findy-agency*`,
            ],
          }),
        ],
        primaryOutputDirectory: "aws-ecs/cdk.out",
      }),
      codeBuildDefaults: {
        buildEnvironment: {
          environmentVariables: {
            ...environmentVariables,
          },
        },
      },
    });

    return pipeline;
  }

  createECSUpdateStep(clusterName: CfnOutput, serviceName: CfnOutput) {
    return new CodeBuildStep("FindyAgencyDeployBackendStep", {
      projectName: "FindyAgencyDeployBackend",
      commands: [
        `aws ecs update-service --cluster "$CLUSTER_NAME" --service "$SERVICE_NAME" --force-new-deployment --deployment-configuration="deploymentCircuitBreaker={enable=false,rollback=false},maximumPercent=100,minimumHealthyPercent=0"`,
      ],
      envFromCfnOutputs: {
        CLUSTER_NAME: clusterName,
        SERVICE_NAME: serviceName,
      },
      rolePolicyStatements: [
        new PolicyStatement({
          actions: ["ecs:UpdateService"],
          resources: [
            `arn:aws:ecs:${this.region}:${this.account}:service/*FindyAgency*`,
          ],
        }),
      ],
      primaryOutputDirectory: ".",
    });
  }

  createFrontendBuildStep(input: CodePipelineSource) {
    const host = `${process.env.SUB_DOMAIN_NAME}.${process.env.DOMAIN_NAME}`;
    return new CodeBuildStep("FindyAgencyBuildFrontendStep", {
      projectName: "FindyAgencyBuildFrontend",
      input,
      commands: ["apk add bash", "npm ci", "npm run build"],
      buildEnvironment: {
        buildImage: codebuild.LinuxBuildImage.fromDockerRegistry(
          "public.ecr.aws/docker/library/node:16.14.2-alpine3.15"
        ),
        environmentVariables: {
          REACT_APP_GQL_HOST: {
            value: host,
          },
          REACT_APP_AUTH_HOST: {
            value: host,
          },
          REACT_APP_HTTP_SCHEME: {
            value: "https",
          },
          REACT_APP_WS_SCHEME: {
            value: "wss",
          },
        },
      },
      primaryOutputDirectory: "./build",
    });
  }

  createFrontendDeployStep(input: cdk.pipelines.FileSet | undefined) {
    return new CodeBuildStep("FindyAgencyDeployFrontendStep", {
      input,
      projectName: "FindyAgencyDeployFrontend",
      commands: [
        `V1=$(curl https://$SUB_DOMAIN_NAME.$DOMAIN_NAME/version.txt || echo "0")`,
        `V2=$(cat ./version.txt)`,
        `if [ "$V1" != "$V2" ]; then aws s3 sync --delete . s3://$SUB_DOMAIN_NAME.$DOMAIN_NAME; fi`,
      ],
      rolePolicyStatements: [
        new PolicyStatement({
          actions: ["s3:Put*", "s3:Delete*", "s3:Get*", "s3:List*"],
          resources: ["*"],
        }),
      ],
      primaryOutputDirectory: ".",
    });
  }

  createAdminOnboardTestStep(
    input: CodePipelineSource,
    ecsUpdateOutput: cdk.pipelines.FileSet | undefined
  ) {
    return new CodeBuildStep("FindyAgencyAdminOnboardStep", {
      input,
      additionalInputs: { ecsUpdate: ecsUpdateOutput! },
      projectName: "FindyAgencyAdminOnboard",
      commands: [
        // wait for backend to start
        "./aws-ecs/tools/wait-for-ready.sh",

        // install findy-agent-cli
        "curl https://raw.githubusercontent.com/findy-network/findy-agent-cli/HEAD/install.sh > install.sh",
        "chmod a+x install.sh",
        "sudo ./install.sh -b /bin",

        "echo Register admin $ADMIN_ID",
        // Next step may fail if admin is already registered
        `findy-agent-cli authn register -u $ADMIN_ID --url https://$SUB_DOMAIN_NAME.$DOMAIN_NAME --origin https://$SUB_DOMAIN_NAME.$DOMAIN_NAME --key $ADMIN_AUTHN_KEY | true`,
        `findy-agent-cli authn login -u $ADMIN_ID --url https://$SUB_DOMAIN_NAME.$DOMAIN_NAME --origin https://$SUB_DOMAIN_NAME.$DOMAIN_NAME --key $ADMIN_AUTHN_KEY`,
      ],
      primaryOutputDirectory: "./aws-ecs/tools",
    });
  }

  createE2ETestStep(
    input: CodePipelineSource,
    waitReadyOutput: cdk.pipelines.FileSet | undefined
  ) {
    return new CodeBuildStep("FindyAgencyE2ETestStep", {
      input,
      additionalInputs: { waitReadyOutput: waitReadyOutput! },
      projectName: "FindyAgencyE2ETest",
      commands: [
        // install findy-agent-cli
        "curl https://raw.githubusercontent.com/findy-network/findy-agent-cli/HEAD/install.sh > install.sh",
        "chmod a+x install.sh",
        "sudo ./install.sh -b /bin",

        // save certificate
        "echo Connecting to $AGENCY_API_URL",
        "./e2e/dl-cert.sh",

        // install needed deps
        "npm install nightwatch@2.1.7 --legacy-peer-deps",
        "full_version=$(google-chrome --product-version)",
        'chrome_version=$(echo "${full_version%.*.*.*}")',
        "npm install chromedriver@$chrome_version --legacy-peer-deps",

        // onboard new user and agent
        "npm run test:e2e",

        // these may fail if values are already saved
        "aws ssm put-parameter --name \"/findy-agency-e2e/user-name\" --value $(jq -r '.user' ./e2e/e2e.user.json) --type String 2>&1 > /dev/null | true",
        "aws ssm put-parameter --name \"/findy-agency-e2e/org-name\" --value $(jq -r '.organisation' ./e2e/e2e.user.json) --type String 2>&1 > /dev/null | true",
        "aws ssm put-parameter --name \"/findy-agency-e2e/default-key\" --value $(jq -r '.key' ./e2e/e2e.user.json) --type String 2>&1 > /dev/null | true",
        "aws ssm put-parameter --name \"/findy-agency-e2e/cred-def-id\" --value $(jq -r '.credDefId' ./e2e/e2e.user.json) --type String 2>&1 > /dev/null | true",

        // existing user, new organisation
        'export E2E_USER=$(aws ssm get-parameter --name "/findy-agency-e2e/user-name" | jq -r .Parameter.Value)',
        'export E2E_KEY=$(aws ssm get-parameter --name "/findy-agency-e2e/default-key" | jq -r .Parameter.Value)',
        "npm run test:e2e",

        // existing user, existing organisation
        'export E2E_ORG=$(aws ssm get-parameter --name "/findy-agency-e2e/org-name" | jq -r .Parameter.Value)',
        'export E2E_CRED_DEF_ID=$(aws ssm get-parameter --name "/findy-agency-e2e/cred_def_id" | jq -r .Parameter.Value)',
        "npm run test:e2e",
      ],
      rolePolicyStatements: [
        new PolicyStatement({
          actions: ["ssm:PutParameter", "ssm:GetParameter"],
          resources: [
            `arn:aws:ssm:${this.region}:${this.account}:parameter/findy-agency-e2e*`,
          ],
        }),
      ],
      primaryOutputDirectory: "./tests_output",
      buildEnvironment: {
        environmentVariables: {
          AGENCY_TLS_PATH: {
            value: "./e2e/cert",
          },
          AGENCY_URL: {
            value: `https://${process.env.SUB_DOMAIN_NAME}.${process.env.DOMAIN_NAME}`,
          },
          AGENCY_API_URL: {
            value: `${process.env.API_SUB_DOMAIN_NAME}.${process.env.DOMAIN_NAME}:${GRPCPortNumber}`,
          },
          AGENCY_REGISTER_WAIT_TIME: {
            value: "60",
          },
          E2E_ORG_SEED: {
            type: codebuild.BuildEnvironmentVariableType.SECRETS_MANAGER,
            value: "FindyAgency:findy-agency-e2e-org-seed",
          },
        },
      },
    });
  }
}
