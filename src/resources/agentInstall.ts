import * as pulumi from "@pulumi/pulumi";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import * as yaml from "yaml";

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
    const env = { ...process.env };
    execSync(`openshift-install agent wait-for install-complete --dir ${inputs.workdir} --log-level=debug`, { env, stdio: "inherit" });

    const authDir = path.join(inputs.workdir, "auth");
    const kubeconfigPath = path.join(authDir, "kubeconfig");
    const passwordPath = path.join(authDir, "kubeadmin-password");

    const kubeconfig = fs.readFileSync(kubeconfigPath, "utf8");
    const kubeadminPassword = fs.readFileSync(passwordPath, "utf8");

    const installCfgPath = path.join(inputs.workdir, "install-config.yaml");
    const cfg = yaml.parse(fs.readFileSync(installCfgPath, "utf8"));
    const consoleURL = `https://console-openshift-console.apps.${cfg.metadata.name}.${cfg.baseDomain}`;

    return {
      id: inputs.workdir,
      outs: {
        kubeconfig,
        kubeadminPassword,
        consoleURL,
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
