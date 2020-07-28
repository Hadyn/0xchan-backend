import {BuidlerConfig, task, usePlugin} from "@nomiclabs/buidler/config";
import process from "process";
import ZchHubArtifact from "./artifacts/ZchHub.json"
import {ZchHub} from "./types/ethers-contracts/ZchHub";

usePlugin("@nomiclabs/buidler-ethers");

task("deploy", "Deploys 0xchan to the provided network", async (taskArgs, bre) => {
  const [account] = await bre.ethers.getSigners();

  const ZchAnns = await bre.ethers.getContractFactory("ZchAnns");
  const ZchToken = await bre.ethers.getContractFactory("ZchToken");
  const ZchBoards = await bre.ethers.getContractFactory("ZchBoards");

  const anns = await ZchAnns.connect(account).deploy();
  await anns.deployed();

  const token = await ZchToken.connect(account).deploy("0x0000000000000000000000000000000000000000")
  await token.deployed();

  const boards = await ZchBoards.connect(account).deploy(token.address);
  await boards.deployed();

  let hubAddress = process.env["HUB_ADDRESS"] ?? "";
  if (hubAddress === "") {
    const ZchHub = await bre.ethers.getContractFactory("ZchHub");
    ({address: hubAddress} = await ZchHub.connect(account).deploy());
  }

  const hub = await bre.ethers.getContractAt(ZchHubArtifact.abi, hubAddress, account) as ZchHub;
  await hub.setContractAddress("anns", anns.address);
  await hub.setContractAddress("token", token.address);
  await hub.setContractAddress("boards", boards.address);

  console.log("Successfully deployed ZCH")
  console.log("-------------------------")
  console.log("ZchHub:    %s", hub.address)
  console.log("ZchAnns:   %s", anns.address)
  console.log("ZchToken:  %s", token.address)
  console.log("ZchBoards: %s", boards.address)
});

const config: BuidlerConfig = {
  solc: {
    version: "0.6.8"
  },
  networks: {
    development: {
      url: "https://rpc.thicc.app",
      accounts: [ process.env["DEVELOPMENT_GENESIS_PK"] ?? "" ]
    }
  }
};

export default config;
