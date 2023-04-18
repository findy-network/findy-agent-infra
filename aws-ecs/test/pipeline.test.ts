import * as cdk from "aws-cdk-lib";

import { Template } from "aws-cdk-lib/assertions";
import { InfraPipelineStack } from "../lib/pipeline-stack";

test("Pipeline Created", () => {
  const app = new cdk.App({ context: { 'aws:cdk:bundling-stacks': [] } });
  const stack = new InfraPipelineStack(app, "MyTestStack", {
    env: { account: "123456789012", region: "us-east-1" },
  });

  const template = Template.fromStack(stack);

  expect(template).toMatchSnapshot();
});
