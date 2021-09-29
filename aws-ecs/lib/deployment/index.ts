import * as cdk from '@aws-cdk/core';
import { ConfigBucket } from './config-bucket';
import { ContainerDetails } from './containers';

export interface DeploymentStackProps extends cdk.StackProps {
  prod: boolean;
  containerNames: ContainerDetails;
}

export class DeploymentStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: DeploymentStackProps) {
    super(scope, `Deployment`, props);

    const { prod, env } = props;

    // ECS services config files
    new ConfigBucket(this, `${id}Deployment`, {
      prod,
      env
    });
  }
}
