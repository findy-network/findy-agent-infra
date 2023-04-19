import { CfnOutput, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { Backend } from "./backend";

import { Frontend } from "./frontend";

export class InfraStack extends Stack {
  public readonly clusterName: CfnOutput;
  public readonly serviceArn: CfnOutput;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    new Frontend(this, `${id}Frontend`, {
      rootDomainName: process.env.DOMAIN_NAME || "example.com",
      appDomainPrefix: process.env.SUB_DOMAIN_NAME || "example",
      apiDomainPrefix: process.env.API_SUB_DOMAIN_NAME || "example-api",
    });

    const backend = new Backend(this, `${id}Backend`, {
      rootDomainName: process.env.DOMAIN_NAME || "example.com",
      appDomainPrefix: process.env.SUB_DOMAIN_NAME || "example",
      apiDomainPrefix: process.env.API_SUB_DOMAIN_NAME || "example-api",
      genesisTransactions: process.env.GENESIS_TRANSACTIONS || "no_genesis_needed",
    });

    this.clusterName = backend.clusterName;
    this.serviceArn = backend.serviceArn;
  }
}
