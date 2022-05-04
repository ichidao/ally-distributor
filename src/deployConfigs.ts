const { network } = require("hardhat");

export const configs: any = {
  // mainnet
  1: {
    ally: "",
    merkleRoot: "",
  },
  // kovan
  42: {
    ally: "0xF9B53ea31bdC6364C1BFD84a53aA8235ee6bDf2F",
    merkleRoot: "0x06a27abe2a9774e212b4c18d103bfd8085fb4f00dbe0c774df9c62f8aa8c596c",
  },
};

export const getCurrentConfig = () => configs[network.config.chainId];
