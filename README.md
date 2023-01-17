![Solidity unit test](https://github.com/ffakira/vesting/actions/workflows/hardhat.yml/badge.svg)
# Simple Vesting Contract

The contracts allow to read from a CSV file, and whitelist three different ways: batch, merkle tree and ECDSA.

In the `contracts` folder there are three different whitelist mechanism:

* `Vesting.sol` batch of `adddress[]` users whitelist
* `MerkleVesting.sol` whitelist users by merkle tree
* `SignVesting.sol` through ECDSA

There are some unit tests provided for each of the smart contracts, along with some additional
helper functions in the `test/utils` folder.

### Running unit test
To get started make sure to install the npm modules. The tests beeen run on a node v18.4.0
```
$ npm i
```

Followed by the command:
```
$ npm test
```

### Additional details

#### `Vesting.sol` contract
* Making batch transaction you need to keep in track of gas. If you attempt to transact a large arrray
it may potentially run out of gas.
* Ideally you would batch smaller list of addresses.
* It can be very expensive when you are doing a large amount of users.

Here is an implementation of the `whitelist` mechanism for batch implemntation

```sol
function whitelist(
    address[] memory _user, 
    uint256[] memory _amount, 
    uint256[] memory _lockPeriod
) public onlyOwner {
    require(
        _user.length != 0 &&
        _amount.length != 0 &&
        _lockPeriod.length != 0,
        "Vesting: params cannot be empty"
    );
    require(
        _user.length == _amount.length && 
        _user.length == _lockPeriod.length && 
        _amount.length == _lockPeriod.length, 
        "Vesting: params length are not equal"
    );

    for (uint256 i; i < _user.length;) {
        userWhitelist[_user[i]].amount = _amount[i];
        userWhitelist[_user[i]].lockPeriod = block.timestamp + _lockPeriod[i];
        userWhitelist[_user[i]].updatedAt = block.timestamp + _lockPeriod[i];
        userWhitelist[_user[i]].claimedAmount = 0;

        emit WhitelistEvent(_user[i], _amount[i], _lockPeriod[i]);
        unchecked { i++; }
    }
}
```

Usage, let's say you have 2 addresses to be whitelisted alice (0x08C8...36f) and bob (0x2b22...038):
* Ensure that your amount is converted to `wei` before being calling `whitelist` function

```js
import { ethers } from "hardhat"
const ONE_WEEK = 60 * 60 * 24 * 7
/**
 * whitelist[0] = addresses to be whitelisted
 * whitelist[1] = total amount to be claimed in wei
 * whitelist[2] = lock period time (current block timestamp + lockPeriod)
 */
const whitelist = [
    ["0x08C8e533722578834BC844413d3B11e834f1e36f", "0x2b221d0aFB3309b7E7A6e61a24eFd4B12Adc1038"],
    [ethers.utils.parseEther("5000"), ethers.utils.parseEther("9000")],
    [ONE_WEEK, ONE_WEEK]
]

// Only the deployer can invoke this function, since it has onlyOwner modifier
await vestingInstance.whitelist(...whitelist)
```

* Alice can claim a total of 5000 DToken after one week passes
* Bob can claim a total of 9000 DToken after one week passes

An implementation of batch whitelist is seen at `test/utils/index.ts` at `createWhitelist()` function

Along with a unit test provided at `test/Vesting.test.ts`
  * `should allow users to claim token after one month`

#### `MerkleVesting.sol` contract
* It requires the merkle tree to be balanced (if you're planning to make your own implementation, however
a library like `merkletreejs` will ensure that the tree is balanced).
* Requires a storage, since merkle tree is one way hash. You need to map each user to proof hash, in order
to be a successful transaction
* If a mistake is made after generating and deploying the merkle root. You are required to re-deploy a new
contract with a new root tree.

Here is an example of `whitelist` mechanism for merkle tree implementation

```sol
function whitelist(
    address _user,
    uint256 _amount,
    uint256 _lockPeriod, 
    bytes32[] calldata merkleProof
) public nonReentrant {
    require(_user != address(0), "MerkleVesting: cannot be zero address");
    require(!blacklist[_user], "MerkleVesting: address is blacklisted");
    require(!isWhitelist[_user], "MerkleVesting: already whitelisted");

    bytes32 node = keccak256(abi.encodePacked(_user, _amount, _lockPeriod));
    require(MerkleProof.verify(merkleProof, merkleRoot, node), "MerkleVesting: invalid proof");

    userWhitelist[_user].amount = _amount;
    userWhitelist[_user].lockPeriod = block.timestamp + _lockPeriod;
    userWhitelist[_user].updatedAt = block.timestamp + _lockPeriod;
    userWhitelist[_user].claimedAmount = 0;

    isWhitelist[_user] = true;
    emit WhitelistEvent(_user, _amount, _lockPeriod);
}
```

Usage, let's take same example as before where 2 addresses to be whitelisted alice (0x08C8...36f) and bob (0x2b22...038)

```js
import { ethers } from "hardhat"
import { keccak256 } from "@ethersproject/keccak256"
import { MerkleTree } from "merkletreejs"

const ONE_WEEK = 60 * 60 * 24 * 7

// Same whitelist as previous example
const whitelist = [
    ["0x08C8e533722578834BC844413d3B11e834f1e36f", "0x2b221d0aFB3309b7E7A6e61a24eFd4B12Adc1038"],
    [ethers.utils.parseEther("5000"), ethers.utils.parseEther("9000")],
    [ONE_WEEK, ONE_WEEK]
]
const nodeLeaves = []

// convert amount to wei
whitelist[1] = whitelist[1].map(amount => ethers.utils.parseEther(val))
for (let i = 0; i < whitelist[0].length; i++) {
    nodeLeaves.push(ethers.utils.solidityKeccack256(
        ["address", "uint256", "uint256"],
        [whitelist[0][i], whitelist[1][i], whitelist[2][i]]
    ))
}

// Generate the merkle tree
const merkleTree = new MerkleTree(nodeLeaves, keccak256, { sortPairs: true })

/**
 * proof[0] is the hash proof for alice
 * proof[1] is the hash proof for bob
 * If any params are given wrong will throw "MerkleVesting: invalid proof" error
 */
const proof = nodeLeaves.map(leaf => merkleTree.getHexProof(leaf))

// @note: You can also delegate to whitelist for other users
await merkleVestingInstance.whitelist(
    whitelist[0][0],
    whitelist[1][0],
    whitelist[2][0],
    proof[0]
)
```

The `MerkleVesting.sol` has the same implementation for the remaining functions as `Vesting.sol` except for `whitelist` function.

An implementation of batch whitelist is seen at `test/utils/index.ts` at `generateMerkleTree()` function

Along with a unit test provided at `test/MerkleVesting.test.ts`
  * `should provide the correct leaf hash to whitelist user`

#### `SignVesting.sol` contract
