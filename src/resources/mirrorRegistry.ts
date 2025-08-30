import * as pulumi from "@pulumi/pulumi";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export interface MirrorRegistryArgs {
  enabled: pulumi.Input<boolean>;
  archivePath?: pulumi.Input<string>;
  imageSetConfig?: pulumi.Input<string>;
  registryHost?: pulumi.Input<string>;
  tls?: pulumi.Input<{
    caBundle?: pulumi.Input<string>;
    skipVerify?: pulumi.Input<boolean>;
  }>;
}

export interface MirrorRegistryOutputs {
  endpoint: pulumi.Output<string>;
  authFilePath: pulumi.Output<string>;
  registriesConf: pulumi.Output<string>;
  caBundlePath: pulumi.Output<string>;
}

class MirrorRegistryProvider implements pulumi.dynamic.ResourceProvider {
  public async create(inputs: any): Promise<pulumi.dynamic.CreateResult> {
    const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "mirror-"));
    const endpoint = inputs.registryHost || "https://mirror.local";
    const authFilePath = path.join(workdir, "auth.json");
    fs.writeFileSync(authFilePath, "{}", { encoding: "utf8" });
    const registriesConf = path.join(workdir, "registries.conf");
    fs.writeFileSync(registriesConf, "", { encoding: "utf8" });
    const caBundlePath = inputs?.tls?.caBundle
      ? path.join(workdir, "ca.pem")
      : "";
    if (inputs?.tls?.caBundle) {
      fs.writeFileSync(caBundlePath, inputs.tls.caBundle, { encoding: "utf8" });
    }
    return {
      id: workdir,
      outs: {
        endpoint,
        authFilePath,
        registriesConf,
        caBundlePath,
      },
    };
  }
}

export class MirrorRegistry extends pulumi.dynamic.Resource implements MirrorRegistryOutputs {
  public readonly endpoint!: pulumi.Output<string>;
  public readonly authFilePath!: pulumi.Output<string>;
  public readonly registriesConf!: pulumi.Output<string>;
  public readonly caBundlePath!: pulumi.Output<string>;

  constructor(name: string, args: MirrorRegistryArgs, opts?: pulumi.CustomResourceOptions) {
    super(new MirrorRegistryProvider(), name, {
      ...args,
      endpoint: undefined,
      authFilePath: undefined,
      registriesConf: undefined,
      caBundlePath: undefined,
    }, opts);
  }
}
