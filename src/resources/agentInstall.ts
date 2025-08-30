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
}

class AgentInstallProvider implements pulumi.dynamic.ResourceProvider {
  public async create(inputs: any): Promise<pulumi.dynamic.CreateResult> {
    const authDir = path.join(inputs.workdir, "auth");
    const kubeconfigPath = path.join(authDir, "kubeconfig");
    const passwordPath = path.join(authDir, "kubeadmin-password");

    const timeoutMins = inputs.wait?.installTimeoutMins || 60;
    const timeout = timeoutMins * 60 * 1000;
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (fs.existsSync(kubeconfigPath) && fs.existsSync(passwordPath)) {
        const kubeconfig = fs.readFileSync(kubeconfigPath, "utf8");
        const kubeadminPassword = fs.readFileSync(passwordPath, "utf8");
        return {
          id: inputs.workdir,
          outs: { kubeconfig, kubeadminPassword },
        };
      }
      await new Promise((r) => setTimeout(r, 15000));
    }
    throw new Error("Timed out waiting for installation to complete");
  }
}

export class AgentInstall extends pulumi.dynamic.Resource implements AgentInstallOutputs {
  public readonly kubeconfig!: pulumi.Output<string>;
  public readonly kubeadminPassword!: pulumi.Output<string>;

  constructor(name: string, args: AgentInstallArgs, opts?: pulumi.CustomResourceOptions) {
    super(new AgentInstallProvider(), name, { ...args, kubeconfig: undefined, kubeadminPassword: undefined }, opts);
  }
}
