import { DeployFunction } from "hardhat-deploy/types";

import { getCurrentConfig } from "../src/deployConfigs";

const func: DeployFunction = async function ({
  getNamedAccounts,
  deployments,
}) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  console.log(deployer);

  const config = await getCurrentConfig();

  console.log(config);

  await deploy("MerkleDistributor", {
    from: deployer,
    args: [
      config.ally,
      config.merkleRoot,
    ],
    log: true,
  });
};

func.tags = ["kovan"];
//func.tags = ["ethereum"];

export default func;
