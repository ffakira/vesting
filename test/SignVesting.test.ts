import { BigNumber } from "@ethersproject/bignumber"
import hre, { ethers } from "hardhat"
import { expect } from "chai"
import { BLOCK_PER_SECOND, generateSignature, getWhitelist, ONE_MONTH } from "./utils"

enum SignVestingError {
    NONCE_USED = "SignVesting: nonce already been used",
    INVALID_SIG = "SignVesting: invalid signature"
}

describe("SignVesting contracts", function() {
    beforeEach(async function() {
        /**
         * @dev init contract deployment instance
         */
        [this.deployer, ...this.accounts] = await ethers.getSigners()

        const DegenToken = await ethers.getContractFactory("DegenToken")
        this.degenToken = await DegenToken.deploy("DegenToken", "DToken")

        const degenTokenAddress = (await this.degenToken.deployed()).address
        const { signerAddress } = await generateSignature()
        const SignVesting = await ethers.getContractFactory("SignVesting")
        this.signVesting = await SignVesting.deploy(degenTokenAddress, signerAddress)
    })

    afterEach(async function() {
        await hre.network.provider.send("hardhat_reset")
    })

    describe("SignVesting", function() {
        it("should get the correct signer's address", async function() {
            const getSignerAddress = await this.signVesting.signerAddress()
            const { signerAddress } = await generateSignature()
            expect(getSignerAddress).to.equal(signerAddress)
        })

        it("should get a valid signature to whitelist user", async function() {
            const whitelist = await getWhitelist()
            const { signatureList } = await generateSignature()

            for (let i = 0; i < whitelist[0].length; i++) {
                await this.signVesting.whitelist(
                    whitelist[0][i],
                    ethers.utils.parseEther(whitelist[1][i]),
                    whitelist[2][i],
                    1,
                    signatureList[i].v,
                    signatureList[i].r,
                    signatureList[i].s
                )

                const nonceUsed = await this.signVesting.nonceUsed(whitelist[0][i], 1)
                expect(nonceUsed).to.equal(true)

                const [user_, amount_] = await this.signVesting.getWhitelist(whitelist[0][i])
                expect(user_).to.equal(whitelist[0][i])
                expect(amount_).to.deep.equal(ethers.utils.parseEther("10000"))
            }
        })

        it("should fail trying to whitelist with the same nonce", async function() {
            const whitelist = await getWhitelist()
            const { signatureList } = await generateSignature()

            for (let i = 0; i < whitelist[0].length; i++) {
                await this.signVesting.whitelist(
                    whitelist[0][i],
                    ethers.utils.parseEther(whitelist[1][i]),
                    whitelist[2][i],
                    1,
                    signatureList[i].v,
                    signatureList[i].r,
                    signatureList[i].s
                )
            }

            await expect(this.signVesting.whitelist(
                whitelist[0][0],
                ethers.utils.parseEther(whitelist[1][0]),
                whitelist[2][0],
                1,
                signatureList[0].v,
                signatureList[0].r,
                signatureList[0].s
            )).to.be.revertedWith(SignVestingError.NONCE_USED)
        })

        it("should fail providing the wrong params", async function() {
            const whitelist = await getWhitelist()
            const { signatureList } = await generateSignature()

            await expect(this.signVesting.whitelist(
                whitelist[0][0],
                ethers.utils.parseEther("100000"),
                0,
                1,
                signatureList[0].v,
                signatureList[0].r,
                signatureList[0].s
            )).to.be.revertedWith(SignVestingError.INVALID_SIG)
        })

        it("should allow users to claim token after lock period", async function() {
            const futureBlockTime = Math.ceil(Date.now() / 1000) + (ONE_MONTH + BLOCK_PER_SECOND * 10000)
            const whitelist = await getWhitelist()
            const { signatureList } = await generateSignature()

            // transfer tokens to sign vvesting contract
            const signVestingAddress = (await this.signVesting.deployed()).address
            await this.degenToken.mint(signVestingAddress, ethers.utils.parseEther("100000"))
            let balanceOf = await this.degenToken.balanceOf(signVestingAddress)
            expect(balanceOf).to.deep.equal(ethers.utils.parseEther("100000"))

            // whitelist user
            for (let i = 0; i < whitelist[0].length; i++) {
                await this.signVesting.whitelist(
                    whitelist[0][i],
                    ethers.utils.parseEther(whitelist[1][i]),
                    whitelist[2][i],
                    1,
                    signatureList[i].v,
                    signatureList[i].r,
                    signatureList[i].s
                )
            }

            await ethers.provider.send("evm_mine", [futureBlockTime])

            balanceOf = await this.degenToken.balanceOf(this.deployer.address)
            expect(balanceOf).to.deep.equal(BigNumber.from(0))

            // claim
            await this.signVesting.claim()
            const calculateReward = await this.signVesting.calculateReward(this.deployer.address)
            balanceOf = await this.degenToken.balanceOf(this.deployer.address)
            expect(balanceOf).to.deep.equal(calculateReward)
        })
    })
})
