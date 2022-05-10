const { network } = require("hardhat");

export const configs: any = {
  // mainnet
  1: {
    ally: "0x1aa1e61369874bae3444A8Ef6528d6b13D6952EF",
    merkleRoot: "0x8ce354f91fe2ce7ced43cf737d8f3c2d5f2fc10f8fe091219ab94af87c6f1b84",
  },
  // kovan
  42: {
    ally: "0xF9B53ea31bdC6364C1BFD84a53aA8235ee6bDf2F",
    merkleRoot: "0x86d94a31030c94572e4742ee7a1cfbf6482cb58c4296b9341a57e0d0750a7ab2",
  },
};

export const getCurrentConfig = () => configs[network.config.chainId];
