import { Vpc } from '@aws-cdk/aws-ec2';
import * as cdk from '@aws-cdk/core';
import { Cluster, FargateService } from '@aws-cdk/aws-ecs';
import { EcsDeployAction } from '@aws-cdk/aws-codepipeline-actions';
import { Artifact, IStage } from '@aws-cdk/aws-codepipeline';

export interface DeploymentStackProps extends cdk.StackProps {
  prod: boolean;
  vpcName: string;
  clusterName: string;
  serviceArn: string;
  deployStage: IStage;
  actionInput: Artifact;
}

export class ECSDeployStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: DeploymentStackProps) {
    super(scope, `ECSDeploy`, props);
    const { clusterName, vpcName, serviceArn, deployStage, actionInput } =
      props;
    const importedVpc = Vpc.fromLookup(this, `ImportedVpc`, {
      vpcName
    });
    const importedCluster = Cluster.fromClusterAttributes(
      this,
      `ImportedCluster`,
      {
        clusterName: clusterName,
        vpc: importedVpc,
        securityGroups: []
      }
    );

    const backendFargateService = FargateService.fromFargateServiceAttributes(
      this,
      `ImportedBackendService`,
      {
        cluster: importedCluster,
        serviceArn: serviceArn
      }
    );

    deployStage.addAction(
      new EcsDeployAction({
        service: backendFargateService,
        actionName: `DeployActionBackend`,
        input: actionInput
      })
    );
  }
}
