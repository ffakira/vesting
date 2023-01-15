# Simple Vesting Contract

The contracts allow to read from a CSV file, and whitelist three different ways: batch, merkle tree and offline signing transaction.

In the `contracts` folder there are three different whitelist mechanism:

* `Vesting.sol` batch of `adddress[]` users whitelist
* `MerkleVesting.sol` whitelist users by merkle tree
* `SignVesting.sol` offchain vesting

There are some unit tests provided for each of the smart contracts, along with some additional
helper functions in the `test/utils` folder.

### Limitations and Security concerns

* `Vesting.sol` will run out of gas, if your whitelist a large number of addresses. Ideally you would
use a batch, when you have a small list of addresses.
* `MerkleVesting.sol` the merkle tree requires to be balanced (if you're planning to make your own implementation).
So some of the leaf nodes may be duplicated in order to transverse through the tree.
* `SignVesting.sol` if the signer's private key gets compromised than the entire smart contract is going to be
compromised.

```shell
npx hardhat help
npx hardhat test
REPORT_GAS=true npx hardhat test
npx hardhat node
npx hardhat run scripts/deploy.ts
```
