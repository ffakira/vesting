import { BigNumber } from "@ethersproject/bignumber"
import hre, { ethers } from "hardhat"
import { BLOCK_PER_SECOND, generateMerkleTree, ONE_MONTH, ZERO_ADDRESS } from "./utils"
import { expect } from "chai"

enum MerkleVestingError {
    OWNABLE = "Ownable: caller is not the owner",
    INVALID_PROOF = "MerkleVesting: invalid proof",
    ZERO_ADDRESS = "MerkleVesting: cannot be zero address",
    BLACKLISTED = "MerkleVesting: address is blacklisted"
}

describe("MerkleVesting contracts", function() {
    beforeEach(async function() {
        /**
         * @dev init contranct deployment instance
         */
        [this.deployer, ...this.accounts] = await ethers.getSigners()

        const DegenToken = await ethers.getContractFactory("DegenToken")
        this.degenToken = await DegenToken.deploy("DegenToken", "DToken")

        const degenTokenAddress = (await this.degenToken.deployed()).address
        const { root } = await generateMerkleTree()
        const MerkleVesting = await ethers.getContractFactory("MerkleVesting")
        this.merkleVesting = await MerkleVesting.deploy(degenTokenAddress, root)
    })

    afterEach(async function() {
        await hre.network.provider.send("hardhat_reset")
    })

    describe("MerkleVesting", function() {
        it("should get the correct merkle root hash", async function() {
            const { root } = await generateMerkleTree()
            const merkleRoot = await this.merkleVesting.merkleRoot()
            expect('0x'+root.toString('hex')).to.equal(merkleRoot)
        })

        it("should provide the correct leaf hash to whitelist user", async function() {
            const { tree, leaf } = await generateMerkleTree()
            const proof = leaf.map(leave => tree.getHexProof(leave))
            const accounts = await ethers.getSigners()

            for (let i = 0; i < accounts.length; i++) {
                await expect(this.merkleVesting.whitelist(
                    accounts[i].address, 
                    ethers.utils.parseEther("10000"),
                    ONE_MONTH,
                    proof[i]
                ))

                const isWhitelist = await this.merkleVesting.isWhitelist(accounts[i].address)
                expect(true).to.equal(isWhitelist)
            }
    
            for (let i = 0; i < accounts.length; i++) {
                const [user_, amount_] = await this.merkleVesting.getWhitelist(accounts[i].address)
                expect(accounts[i].address).to.equal(user_)
                expect(ethers.utils.parseEther("10000")).to.deep.equal(amount_)
            }
        })
    
        it("should fail, if it provides wrong leaf hash or params", async function() {
            const { tree, leaf } = await generateMerkleTree()
            const proof = leaf.map(leave => tree.getHexProof(leave))

            // @dev invalid amount and lock period
            await expect(this.merkleVesting.whitelist(
                this.deployer.address,
                ethers.utils.parseEther("99999"),
                1,
                proof[0]
            )).to.be.revertedWith(MerkleVestingError.INVALID_PROOF)

            // @dev invalid lock period and hash proof
            await expect(this.merkleVesting.whitelist(
                this.accounts[0].address,
                ethers.utils.parseEther("10000"),
                1,
                proof[2]
            )).to.be.revertedWith(MerkleVestingError.INVALID_PROOF)

            // @dev invalid address, lock period, amount and hash proof
            await expect(this.merkleVesting.whitelist(
                (await this.merkleVesting.deployed()).address,
                ethers.utils.parseEther("100000"),
                1,
                []
            )).to.be.revertedWith(MerkleVestingError.INVALID_PROOF)
        })

        it("should fail, providing a zero address", async function() {
            await expect(this.merkleVesting.whitelist(
                ZERO_ADDRESS,
                ethers.utils.parseEther("1337"),
                0,
                []
            )).to.be.revertedWith(MerkleVestingError.ZERO_ADDRESS)
        })

        it("should fail, if the user tries to whitelist if they are blacklisted", async function() {
            const { tree, leaf } = await generateMerkleTree()
            const proof = leaf.map(leave => tree.getHexProof(leave))

            await expect(this.merkleVesting.addBlacklist(this.accounts[0].address))
                .emit(this.merkleVesting, "Blacklist")
                .withArgs(this.accounts[0].address, true)

            await expect(this.merkleVesting.whitelist(
                this.accounts[0].address,
                ethers.utils.parseEther("10000"),
                ONE_MONTH,
                proof[0]
            )).to.be.revertedWith(MerkleVestingError.BLACKLISTED)
        })

        it("should allow users to claim token after lock period", async function() {
            const futureBlockTime = Math.ceil(Date.now() / 1000) + (ONE_MONTH + BLOCK_PER_SECOND * 10000)
            const { tree, leaf } = await generateMerkleTree()
            const proof = leaf.map(leave => tree.getHexProof(leave))

            // transfer tokens to the merkle vesting contract
            const merkleVestingAddress = (await this.merkleVesting.deployed()).address
            await this.degenToken.mint(merkleVestingAddress, ethers.utils.parseEther("100000"))
            let balanceOf = await this.degenToken.balanceOf(merkleVestingAddress)
            expect(ethers.utils.parseEther("100000")).to.deep.equal(balanceOf)

            // whitelist user
            await this.merkleVesting.whitelist(
                this.deployer.address,
                ethers.utils.parseEther("10000"),
                ONE_MONTH,
                proof[0]
            )

            await ethers.provider.send("evm_mine", [futureBlockTime])

            balanceOf = await this.degenToken.balanceOf(this.deployer.address)
            expect(BigNumber.from(0)).to.deep.equal(balanceOf)

            // claim
            await this.merkleVesting.claim()
            const claculateReward = await this.merkleVesting.calculateReward(this.deployer.address)
            balanceOf = await this.degenToken.balanceOf(this.deployer.address)
            expect(claculateReward).to.deep.equal(balanceOf)
        })

        it("should fail users to claim token when their blacklisted", async function() {
            const futureBlockTime = Math.ceil(Date.now() / 1000) + (ONE_MONTH + BLOCK_PER_SECOND * 10000)
            const { tree, leaf } = await generateMerkleTree()
            const proof = leaf.map(leave => tree.getHexProof(leave))

            // transfer tokens to the merkle vesting contract
            const merkleVestingAddress = (await this.merkleVesting.deployed()).address
            await this.degenToken.mint(merkleVestingAddress, ethers.utils.parseEther("100000"))
            let balanceOf = await this.degenToken.balanceOf(merkleVestingAddress)
            expect(ethers.utils.parseEther("100000")).to.deep.equal(balanceOf)

            // whitelist user
            await this.merkleVesting.whitelist(
                this.accounts[0].address,
                ethers.utils.parseEther("10000"),
                ONE_MONTH,
                proof[1]
            )

            // blacklist user
            await this.merkleVesting.addBlacklist(this.accounts[0].address)
            await ethers.provider.send("evm_mine", [futureBlockTime])

            // attempt to claim
            await expect(this.merkleVesting.connect(this.accounts[0]).claim())
                .to.be.revertedWith(MerkleVestingError.BLACKLISTED)
        })
    })
})
