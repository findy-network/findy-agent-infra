import * as cdk from '@aws-cdk/core';
import { Repository } from '@aws-cdk/aws-ecr';
import { BuildSpec, PipelineProject } from '@aws-cdk/aws-codebuild';
import { Artifact, IStage } from '@aws-cdk/aws-codepipeline';
import { Action, CodeBuildAction } from '@aws-cdk/aws-codepipeline-actions';
import { Role, ServicePrincipal, ManagedPolicy } from '@aws-cdk/aws-iam';

export interface ImagePipelineProps {
  env: cdk.Environment | undefined;
  prod: boolean;
  buildInput: Artifact;
  containerNames: {
    agent: string;
    auth: string;
    vault: string;
  };
}

export class ImagePipeline {
  public readonly agentImageURL: string;
  public readonly authImageURL: string;
  public readonly vaultImageURL: string;

  public readonly imageDetails: Artifact;
  public readonly buildAction: Action;

  constructor(scope: cdk.Construct, id: string, props: ImagePipelineProps) {
    const repositories = this.createECR(scope, props);

    this.agentImageURL = repositories[0].repositoryUriForDigest();
    this.authImageURL = repositories[1].repositoryUriForDigest();
    this.vaultImageURL = repositories[2].repositoryUriForDigest();

    const pullAction = this.createPullAction(scope, id, props);
    this.imageDetails = pullAction.output;
    this.buildAction = pullAction.action;
  }

  createECR(scope: cdk.Construct, props: ImagePipelineProps): Repository[] {
    const { prod } = props;
    const maxImageCount = prod ? 6 : 3;

    const services = ['agent', 'auth', 'vault'];

    const repositories = services.map(
      (name) =>
        new Repository(scope, name, {
          imageScanOnPush: true,
          removalPolicy: prod
            ? cdk.RemovalPolicy.RETAIN
            : cdk.RemovalPolicy.DESTROY
        })
    );

    repositories.map((repo) => {
      repo.addLifecycleRule({
        description: `Retain max ${maxImageCount} images`,
        maxImageCount
      });
    });
    return repositories;
  }

  createPullAction(
    scope: cdk.Construct,
    id: string,
    props: ImagePipelineProps
  ): { output: Artifact; action: Action } {
    const { buildInput, env } = props;
    const pushRole = new Role(scope, 'BuildProjectRole', {
      assumedBy: new ServicePrincipal('codebuild.amazonaws.com')
    });
    pushRole.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName(
        'AmazonEC2ContainerRegistryPowerUser'
      )
    );
    const name = `${id}ImagePipelinePushImages`;
    const output = new Artifact();

    const action = new CodeBuildAction({
      actionName: name,
      project: new PipelineProject(scope, name, {
        projectName: name,
        buildSpec: BuildSpec.fromObject({
          version: '0.2',
          phases: {
            build: {
              commands: this.createCommands(props)
            }
          },
          artifacts: {
            files: 'imagedefinitions.json'
          }
        }),
        role: pushRole,
        environment: {
          privileged: true
        }
      }),
      input: buildInput, // any source
      outputs: [output]
    });
    return { output, action };
  }

  createCommands(props: ImagePipelineProps) {
    const { env, containerNames } = props;
    const images = [
      {
        container: containerNames.agent,
        source: 'ghcr.io/findy-network/findy-agent',
        target: this.agentImageURL
      },
      {
        container: containerNames.auth,
        source: 'ghcr.io/findy-network/findy-agent-auth',
        target: this.authImageURL
      },
      {
        container: containerNames.vault,
        source: 'ghcr.io/findy-network/findy-agent-vault',
        target: this.vaultImageURL
      }
    ];
    const imagesStr = images.reduce((result, item) => {
      const resItem = `{"name":"${item.container}","imageUri":"${item.target}:latest"}`;
      return result + (result === '' ? resItem : ',' + resItem);
    }, '');

    return [
      `aws ecr get-login-password --region $AWS_DEFAULT_REGION ` +
        `| docker login --username AWS ` +
        `--password-stdin ${env?.account}.dkr.ecr.${env?.region}.amazonaws.com`,
      ...images.map(
        (item) =>
          `docker pull ${item.source}:latest\n` +
          `docker tag ${item.source}:latest ${item.target}:latest\n` +
          `docker push ${item.target}:latest`
      ),
      `printf '[${imagesStr}]' > imagedefinitions.json`
    ];
  }
}
