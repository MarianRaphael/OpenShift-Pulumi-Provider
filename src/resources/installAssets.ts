import * as pulumi from "@pulumi/pulumi";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as yaml from "yaml";
import { spawn } from "child_process";
import * as ipaddr from "ipaddr.js";

const run = (cmd: string, args: string[], opts: any) =>
  new Promise<void>((resolve, reject) => {
    const proc = spawn(cmd, args, opts);
    proc.on("error", reject);
    proc.on("close", code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${cmd} exited with code ${code}`));
      }
    });
  });

export interface NetworkingArgs {
  clusterCIDR: pulumi.Input<string>;
  hostPrefix: pulumi.Input<number>;
  serviceCIDR: pulumi.Input<string>;
  machineCIDR: pulumi.Input<string>;
  networkType?: pulumi.Input<string>;
}

export interface AgentHostArgs {
  hostname?: pulumi.Input<string>;
  role?: pulumi.Input<string>;
  macToIface?: pulumi.Input<{ [mac: string]: string }>;
  networkConfig?: pulumi.Input<any>;
  rootDeviceHints?: pulumi.Input<any>;
}

export interface AgentArgs {
  rendezvousIP?: pulumi.Input<string>;
  hosts?: pulumi.Input<AgentHostArgs[]>;
}

export interface InstallAssetsArgs {
  releaseImage: pulumi.Input<string>;
  baseDomain: pulumi.Input<string>;
  clusterName: pulumi.Input<string>;
  platform: pulumi.Input<string>;
  networking: pulumi.Input<NetworkingArgs>;
  controlPlaneReplicas: pulumi.Input<number>;
  computeReplicas: pulumi.Input<number>;
  pullSecret: pulumi.Input<string>;
  sshPubKey: pulumi.Input<string>;
  agent?: pulumi.Input<AgentArgs>;
  mirror?: pulumi.Input<{
    endpoint: pulumi.Input<string>;
    registriesConf?: pulumi.Input<string>;
    caBundlePath?: pulumi.Input<string>;
    authFilePath?: pulumi.Input<string>;
  }>;
  workdir?: pulumi.Input<string>;
  serveFrom?: pulumi.Input<{ address: pulumi.Input<string>; port?: pulumi.Input<number> }>;
  emitPXE?: pulumi.Input<boolean>;
}

export interface InstallAssetsOutputs {
  isoPath: pulumi.Output<string>;
  isoURL: pulumi.Output<string | undefined>;
  workdir: pulumi.Output<string>;
}

class InstallAssetsProvider implements pulumi.dynamic.ResourceProvider {
  public async create(inputs: any): Promise<pulumi.dynamic.CreateResult> {
    const workdir = inputs.workdir || fs.mkdtempSync(path.join(os.tmpdir(), "assets-"));
    fs.mkdirSync(workdir, { recursive: true });
    // Default networking values and validations
    inputs.networking = inputs.networking || {};
    if (!inputs.networking.networkType) {
      inputs.networking.networkType = "OVNKubernetes";
    }
    if (inputs.networking.networkType !== "OVNKubernetes") {
      throw new Error("Only OVNKubernetes networkType is supported");
    }

    // Replica validation: allow SNO (1) or HA (>=3)
    const cpr = Number(inputs.controlPlaneReplicas);
    if (!(cpr === 1 || cpr >= 3)) {
      throw new Error("controlPlaneReplicas must be 1 (SNO) or >= 3 (HA)");
    }

    // Basic CIDR overlap validation
    const cidrs = [inputs.networking.clusterCIDR, inputs.networking.serviceCIDR, inputs.networking.machineCIDR];
    const parsed = cidrs.map((c: string) => ipaddr.parseCIDR(c));
    const overlaps = (a: any, b: any) => a[0].match(b[0], Math.min(a[1], b[1]));
    for (let i = 0; i < parsed.length; i++) {
      for (let j = i + 1; j < parsed.length; j++) {
        if (overlaps(parsed[i], parsed[j])) {
          throw new Error("Networking CIDRs must not overlap");
        }
      }
    }

    // Multi node requires rendezvous IP
    const totalReplicas = inputs.controlPlaneReplicas + inputs.computeReplicas;
    if (totalReplicas > 1 && !inputs.agent?.rendezvousIP) {
      throw new Error("rendezvousIP is required for multi-node clusters");
    }

    const installConfig: any = {
      apiVersion: "v1",
      baseDomain: inputs.baseDomain,
      metadata: { name: inputs.clusterName },
      networking: {
        networkType: inputs.networking.networkType,
        clusterNetwork: [
          { cidr: inputs.networking.clusterCIDR, hostPrefix: inputs.networking.hostPrefix },
        ],
        serviceNetwork: [inputs.networking.serviceCIDR],
        machineNetwork: [{ cidr: inputs.networking.machineCIDR }],
      },
      compute: [{ name: "worker", replicas: inputs.computeReplicas }],
      controlPlane: { name: "master", replicas: inputs.controlPlaneReplicas },
      platform: { none: {} },
      pullSecret: inputs.pullSecret,
      sshKey: inputs.sshPubKey,
    };

    // Mirror / disconnected support
    if (inputs.mirror?.endpoint) {
      if (!inputs.mirror.caBundlePath || !inputs.mirror.registriesConf) {
        throw new Error("Mirror requires caBundlePath and registriesConf");
      }
      installConfig.imageContentSources = [
        { source: "quay.io/openshift-release-dev/ocp-release", mirrors: [inputs.mirror.endpoint] },
        { source: "quay.io/openshift-release-dev/ocp-v4.0-art-dev", mirrors: [inputs.mirror.endpoint] },
      ];
      installConfig.additionalTrustBundle = fs.readFileSync(inputs.mirror.caBundlePath, "utf8");
    }

    fs.writeFileSync(path.join(workdir, "install-config.yaml"), yaml.stringify(installConfig));

    const machineNet = ipaddr.parseCIDR(inputs.networking.machineCIDR);
    if (inputs.agent?.rendezvousIP) {
      const rv = ipaddr.parse(inputs.agent.rendezvousIP);
      if (!rv.match(machineNet[0], machineNet[1])) {
        throw new Error("rendezvousIP must be within machineCIDR");
      }
    }

    const hosts = (inputs.agent?.hosts || []).map((h: any) => {
      const host: any = { hostname: h.hostname, role: h.role };
      if (h.macToIface) {
        host.networkInterfaces = Object.entries(h.macToIface).map(([mac, name]) => ({
          name,
          macAddress: mac,
        }));
      }
      if (h.networkConfig) {
        const cfg = typeof h.networkConfig === "string" ? yaml.parse(h.networkConfig) : h.networkConfig;
        const interfaces = cfg?.interfaces || [];
        interfaces.forEach((iface: any) => {
          (iface.ipv4?.address || []).forEach((addr: any) => {
            if (!ipaddr.parse(addr.ip).match(machineNet[0], machineNet[1])) {
              throw new Error(`Host ${h.hostname || ""} IP ${addr.ip} not in machineCIDR`);
            }
          });
        });
        host.networkConfig = h.networkConfig;
      }
      if (h.rootDeviceHints) {
        host.rootDeviceHints = h.rootDeviceHints;
      }
      return host;
    });

    const agentConfig = {
      apiVersion: "v1beta1",
      kind: "AgentConfig",
      rendezvousIP: inputs.agent?.rendezvousIP,
      hosts,
    };
    fs.writeFileSync(path.join(workdir, "agent-config.yaml"), yaml.stringify(agentConfig));

    // Invoke openshift-install to create ISO and optional PXE artifacts
    const env = { ...process.env } as any;
    if (inputs.mirror?.authFilePath) {
      env.REGISTRY_AUTH_FILE = inputs.mirror.authFilePath;
    }
    if (inputs.releaseImage) {
      env.OPENSHIFT_INSTALL_RELEASE_IMAGE = inputs.releaseImage;
    }

    const args = ["agent", "create", "image", "--dir", workdir, "--log-level=info"];
    if (inputs.releaseImage) {
      args.push("--release-image", inputs.releaseImage);
    }
    if (inputs.mirror?.registriesConf) {
      args.push("--registry-config", inputs.mirror.registriesConf);
    }
    await run("openshift-install", args, { env, stdio: "inherit" });

    if (inputs.emitPXE) {
      const pxeArgs = ["agent", "create", "pxe-files", "--dir", workdir];
      if (inputs.releaseImage) {
        pxeArgs.push("--release-image", inputs.releaseImage);
      }
      if (inputs.mirror?.registriesConf) {
        pxeArgs.push("--registry-config", inputs.mirror.registriesConf);
      }
      await run("openshift-install", pxeArgs, { env, stdio: "inherit" });
    }

    const isoPath = path.join(workdir, "agent.x86_64.iso");

    let isoURL: string | undefined;
    if (inputs.serveFrom) {
      const port = inputs.serveFrom.port || 8080;
      const server = spawn("python3", ["-m", "http.server", `${port}`, "--bind", inputs.serveFrom.address], {
        cwd: workdir,
        stdio: "inherit",
        detached: true,
      });
      server.unref();
      isoURL = `http://${inputs.serveFrom.address}:${port}/agent.x86_64.iso`;
    }

    return {
      id: workdir,
      outs: {
        isoPath,
        isoURL,
        workdir,
      },
    };
  }
}

export class InstallAssets extends pulumi.dynamic.Resource implements InstallAssetsOutputs {
  public readonly isoPath!: pulumi.Output<string>;
  public readonly isoURL!: pulumi.Output<string | undefined>;
  public readonly workdir!: pulumi.Output<string>;

  constructor(name: string, args: InstallAssetsArgs, opts?: pulumi.CustomResourceOptions) {
    super(new InstallAssetsProvider(), name, {
      ...args,
      isoPath: undefined,
      isoURL: undefined,
      workdir: undefined,
    }, opts);
  }
}
