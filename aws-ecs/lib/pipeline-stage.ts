import { InfraStack } from "./infra-stack";
import { Stage, StageProps, CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";

export class InfraPipelineStage extends Stage {
  public readonly clusterName: CfnOutput;
  public readonly serviceArn: CfnOutput;
  public readonly certArn: CfnOutput;
  constructor(scope: Construct, id: string, props?: StageProps) {
    super(scope, id, props);

    const infra = new InfraStack(this, "FindyAgencyInfraStack", props);
    this.clusterName = infra.clusterName;
    this.serviceArn = infra.serviceArn;
    this.certArn = infra.certArn;
  }
}
