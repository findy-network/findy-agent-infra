import { Template } from "aws-cdk-lib/assertions";

export default (template: Template) => {
  // TODO: avoid SourceObjectKeys hash changes
  const bucketDeploymentObject = template.findResources('Custom::CDKBucketDeployment');
  const keys = Object.keys(bucketDeploymentObject)
  if (keys.length > 0) {
    const bucketDeploymentKey = Object.keys(bucketDeploymentObject)[0]
    const json = template.toJSON()
    json.Resources[bucketDeploymentKey].Properties.SourceObjectKeys =
      json.Resources[bucketDeploymentKey].Properties.SourceObjectKeys.map((_: string, index: number) => `${index}.zip`)
  }
  return template.toJSON()
}

