import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import * as Infra from "../lib/infra-stack";

test("Infra Stack Created", () => {
  const app = new cdk.App({ context: { 'aws:cdk:bundling-stacks': [] } });
  const stack = new Infra.InfraStack(app, "MyTestStack", {
    env: { account: "123456789012", region: "us-east-1" },
  });
  const template = Template.fromStack(stack);

  template.hasOutput("MyTestStackBackendClusterName3B81216D", {
    Value: {
      Ref: "MyTestStackBackendECSCluster73978D9D",
    },
  });
  template.hasOutput("MyTestStackBackendServiceArn72A3C369", {
    Value: {
      Ref: "MyTestStackBackendService58B1A23C",
    },
  });
});
