import * as pulumi from "@pulumi/pulumi";
import * as fs from "fs";
import * as path from "path";

export interface AgentInstallArgs {
  workdir: pulumi.Input<string>;
  wait?: pulumi.Input<{ bootstrapTimeoutMins?: pulumi.Input<number>; installTimeoutMins?: pulumi.Input<number> }>;
}

export interface AgentInstallOutputs {
  kubeconfig: pulumi.Output<string>;
  kubeadminPassword: pulumi.Output<string>;
  consoleURL: pulumi.Output<string>;
}

class AgentInstallProvider implements pulumi.dynamic.ResourceProvider {
  public async create(inputs: any): Promise<pulumi.dynamic.CreateResult> {
    const authDir = path.join(inputs.workdir, "auth");
    fs.mkdirSync(authDir, { recursive: true });
    const kubeconfigPath = path.join(authDir, "kubeconfig");
    const passwordPath = path.join(authDir, "kubeadmin-password");
    fs.writeFileSync(kubeconfigPath, "apiVersion: v1\nclusters: []\n", { encoding: "utf8" });
    fs.writeFileSync(passwordPath, "changeme", { encoding: "utf8" });
    return {
      id: inputs.workdir,
      outs: {
        kubeconfig: fs.readFileSync(kubeconfigPath, "utf8"),
        kubeadminPassword: fs.readFileSync(passwordPath, "utf8"),
        consoleURL: "https://console-openshift.example.com",
      },
    };
  }
}

export class AgentInstall extends pulumi.dynamic.Resource implements AgentInstallOutputs {
  public readonly kubeconfig!: pulumi.Output<string>;
  public readonly kubeadminPassword!: pulumi.Output<string>;
  public readonly consoleURL!: pulumi.Output<string>;

  constructor(name: string, args: AgentInstallArgs, opts?: pulumi.CustomResourceOptions) {
    super(new AgentInstallProvider(), name, { ...args, kubeconfig: undefined, kubeadminPassword: undefined, consoleURL: undefined }, opts);
  }
}
