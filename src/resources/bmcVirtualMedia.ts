import * as pulumi from "@pulumi/pulumi";

export interface BmcVirtualMediaArgs {
  redfishEndpoint: pulumi.Input<string>;
  username: pulumi.Input<string>;
  password: pulumi.Input<string>;
  isoURL: pulumi.Input<string>;
  bootDevice?: pulumi.Input<string>;
  powerAction?: pulumi.Input<string>;
}

export interface BmcVirtualMediaOutputs {
  lastAction: pulumi.Output<string>;
  mounted: pulumi.Output<boolean>;
  lastTaskState: pulumi.Output<string>;
}

class BmcProvider implements pulumi.dynamic.ResourceProvider {
  public async create(_inputs: any): Promise<pulumi.dynamic.CreateResult> {
    return {
      id: "bmc",
      outs: {
        lastAction: "none",
        mounted: false,
        lastTaskState: "unknown",
      },
    };
  }
}

export class BmcVirtualMedia extends pulumi.dynamic.Resource implements BmcVirtualMediaOutputs {
  public readonly lastAction!: pulumi.Output<string>;
  public readonly mounted!: pulumi.Output<boolean>;
  public readonly lastTaskState!: pulumi.Output<string>;

  constructor(name: string, args: BmcVirtualMediaArgs, opts?: pulumi.CustomResourceOptions) {
    super(new BmcProvider(), name, { ...args, lastAction: undefined, mounted: undefined, lastTaskState: undefined }, opts);
  }
}
