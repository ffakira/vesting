import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.17",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    truffle: {
      url: "http://127.0.0.1:7545",
      allowUnlimitedContractSize: true
    }
  }
};

export default config;
