import * as cdk from "aws-cdk-lib";

import { Template } from "aws-cdk-lib/assertions";
import { Backend } from "../lib/backend";

test("Backend Created", () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, "MyTestStack", {
    env: { account: "123456789012", region: "us-east-1" },
  });

  new Backend(stack, "MyTestBackend", {
    rootDomainName: "example.com",
    appDomainPrefix: "app",
    apiDomainPrefix: "app-api",
    genesisTransactions: "genesis",
  });

  const template = Template.fromStack(stack);

  template.resourceCountIs("AWS::ElasticLoadBalancingV2::LoadBalancer", 1);
  template.resourceCountIs("AWS::RDS::DBInstance", 1);
  template.resourceCountIs("AWS::ECS::Cluster", 1);
  template.resourceCountIs("AWS::ECS::Service", 1);

  template.hasResourceProperties("AWS::ECS::Service", {
    LaunchType: "FARGATE",
  });

  // TODO: avoid SourceObjectKeys hash changes
  const bucketDeploymentObject = template.findResources('Custom::CDKBucketDeployment');
  const bucketDeploymentKey = Object.keys(bucketDeploymentObject)[0]
  const json = template.toJSON()
  json.Resources[bucketDeploymentKey].Properties.SourceObjectKeys =
    json.Resources[bucketDeploymentKey].Properties.SourceObjectKeys.map((_: string, index: number) => `${index}.zip`)

  expect(json).toMatchSnapshot();
});
