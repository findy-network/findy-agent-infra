import { PolicyStatement, Role, ServicePrincipal } from '@aws-cdk/aws-iam';
import { S3OriginConfig, OriginAccessIdentity } from '@aws-cdk/aws-cloudfront';
import * as cdk from '@aws-cdk/core';
import { Bucket, BlockPublicAccess, IBucket } from '@aws-cdk/aws-s3';
import { Artifact, IStage } from '@aws-cdk/aws-codepipeline';
import { Action, CodeBuildAction } from '@aws-cdk/aws-codepipeline-actions';
import {
  BuildSpec,
  PipelineProject,
  LinuxBuildImage
} from '@aws-cdk/aws-codebuild';

export interface PWAPipelineProps {
  env: cdk.Environment | undefined;
  prod: boolean;
  buildInput: Artifact;
  walletDomainName: string;
}

export class PWAPipeline {
  public readonly s3Origin: S3OriginConfig;
  public readonly buildAction: Action;
  public readonly deployAction: Action;

  constructor(scope: cdk.Construct, id: string, props: PWAPipelineProps) {
    const s3Res = this.createS3Bucket(scope, id, props);
    this.s3Origin = s3Res.origin;

    const buildRes = this.createBuildStage(scope, id, props);
    this.buildAction = buildRes.action;

    const deployRes = this.createDeployStage(
      scope,
      id,
      props,
      s3Res.bucket,
      buildRes.output
    );
    this.deployAction = deployRes.action;
  }

  createS3Bucket(
    scope: cdk.Construct,
    id: string,
    props: PWAPipelineProps
  ): { bucket: IBucket; origin: S3OriginConfig } {
    const { walletDomainName: bucketName, prod } = props;
    const bucket = new Bucket(scope, `${id}PWABucket`, {
      bucketName: bucketName,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'index.html',
      removalPolicy: prod
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL
    });

    const bucketOriginAccessIdentity = new OriginAccessIdentity(
      scope,
      `${id}-origin-access-identity`,
      {
        comment: `Access bucket ${bucketName} only from Cloudfront`
      }
    );
    const policyStatement = new PolicyStatement();
    policyStatement.addActions('s3:GetObject*');
    policyStatement.addResources(`${bucket.bucketArn}/*`);
    policyStatement.addCanonicalUserPrincipal(
      bucketOriginAccessIdentity.cloudFrontOriginAccessIdentityS3CanonicalUserId
    );
    bucket.addToResourcePolicy(policyStatement);
    const listPolicyStatement = new PolicyStatement();
    listPolicyStatement.addActions('s3:ListBucket');
    listPolicyStatement.addResources(bucket.bucketArn);
    listPolicyStatement.addCanonicalUserPrincipal(
      bucketOriginAccessIdentity.cloudFrontOriginAccessIdentityS3CanonicalUserId
    );
    bucket.addToResourcePolicy(listPolicyStatement);

    return {
      bucket,
      origin: {
        s3BucketSource: bucket,
        originAccessIdentity: bucketOriginAccessIdentity
      }
    };
  }

  createBuildStage(
    scope: cdk.Construct,
    id: string,
    props: PWAPipelineProps
  ): { action: Action; output: Artifact } {
    const output = new Artifact();
    const name = `${id}PWAPipelineBuild`;
    const { buildInput, walletDomainName } = props;
    const buildAction = new CodeBuildAction({
      actionName: name,
      project: new PipelineProject(scope, name, {
        projectName: name,
        environment: {
          buildImage: LinuxBuildImage.fromDockerRegistry(
            'node:14.17.6-alpine3.13'
          )
        },
        buildSpec: BuildSpec.fromObject({
          version: '0.2',
          phases: {
            build: {
              commands: ['apk add bash', 'npm ci', 'npm run build']
            }
          },
          artifacts: {
            files: ['./build/**/*']
          }
        }),
        environmentVariables: {
          REACT_APP_GQL_HOST: {
            value: walletDomainName
          },
          REACT_APP_AUTH_HOST: {
            value: walletDomainName
          },
          REACT_APP_HTTP_SCHEME: {
            value: 'https'
          },
          REACT_APP_WS_SCHEME: {
            value: 'wss'
          }
        }
      }),
      input: buildInput,
      outputs: [output]
    });
    return { action: buildAction, output };
  }

  createDeployStage(
    scope: cdk.Construct,
    id: string,
    props: PWAPipelineProps,
    bucket: IBucket,
    buildOutput: Artifact
  ): { action: Action } {
    const { walletDomainName } = props;
    const name = `${id}PWAPipelineDeploy`;

    const deployRole = new Role(scope, `${name}Role`, {
      assumedBy: new ServicePrincipal('codebuild.amazonaws.com')
    });
    const policyStatement = new PolicyStatement();
    policyStatement.addActions(
      ...['s3:Put*', 's3:Delete*', 's3:Get*', 's3:List*']
    );
    policyStatement.addResources(
      ...[`${bucket.bucketArn}/*`, `${bucket.bucketArn}`]
    );
    deployRole.addToPolicy(policyStatement);

    const deployAction = new CodeBuildAction({
      actionName: `${name}`,
      project: new PipelineProject(scope, `${name}`, {
        projectName: `${name}`,
        role: deployRole,
        buildSpec: BuildSpec.fromObject({
          version: '0.2',
          phases: {
            build: {
              commands: [
                `V1=$(curl https://${walletDomainName}/version.txt || echo "0")`,
                `V2=$(cat ./build/version.txt)`,
                `if [ "$V1" != "$V2" ]; then aws s3 sync --delete ./build s3://${bucket.bucketName}; fi`
              ]
            }
          }
        })
      }),
      input: buildOutput
    });
    return { action: deployAction };
  }
}
