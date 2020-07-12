import chai from "chai";
import {deployContract, solidity} from "ethereum-waffle";

import IERC20Artifact from "../artifacts/IERC20.json";
import ZchTokenArtifact from "../artifacts/ZchToken.json";
import {ZchToken} from "../types/ethers-contracts/ZchToken"
import {ethers} from "@nomiclabs/buidler";
import {BigNumber, Signer} from "ethers";

import {deployMockContract, MockContract} from '@ethereum-waffle/mock-contract';

chai.use(solidity);

const {expect} = chai;

describe("ZchToken", () => {
    let DECIMALS: number = 18;
    let TEN: BigNumber = BigNumber.from(10);
    let WHOLE_TOKEN: BigNumber = TEN.pow(DECIMALS);

    let zciToken: MockContract;
    let zchToken: ZchToken;

    let owner: Signer;
    let accounts: Signer[];

    beforeEach(async () => {
        [owner, ...accounts] = await ethers.getSigners();

        zciToken = await deployMockContract(owner, IERC20Artifact.abi);
        zchToken = await deployContract(owner, ZchTokenArtifact, [zciToken.address]) as ZchToken;
    });

    it("Allows users to purchase tokens", async () => {
        let [user] = accounts;

        await zchToken.connect(user).purchase({value: 1000});

        expect(await zchToken.balanceOf(await user.getAddress())).to.equal(100000);
    });

    describe("Exchanging", () => {
        it("Allows users to exchange their entire allowance of ZCI", async () => {
            let [user] = accounts;

            await zciToken.mock.allowance.withArgs(await user.getAddress(), zchToken.address).returns(WHOLE_TOKEN);
            await zciToken.mock.transferFrom.returns(true);

            await zchToken.connect(user).exchangeAll();

            expect(await zchToken.balanceOf(await user.getAddress())).to.equal(WHOLE_TOKEN);
        });

        it("Allows users to exchange a fixed amount of ZCI", async () => {
            let [user] = accounts;

            const amount = WHOLE_TOKEN.div(2);

            await zciToken.mock.allowance.withArgs(await user.getAddress(), zchToken.address).returns(WHOLE_TOKEN);
            await zciToken.mock.transferFrom.returns(true);

            await zchToken.connect(user).exchange(amount)

            expect(await zchToken.balanceOf(await user.getAddress())).to.equal(amount);
        });
    });

    describe("Dividends", () => {
        it("Does not give users dividends on their own token purchases", async () => {
            let [user] = accounts;

            await zchToken.connect(user).purchase({value: 1000});
            await zchToken.connect(user).purchase({value: 1000});

            expect(await zchToken.dividendsOf(await user.getAddress())).to.equal(0);
        });

        it("Correctly splits dividends between users with different token amounts", async () => {
            let [user0, user1, user2, user3] = accounts;

            await zchToken.connect(user0).purchase({value: 1000});
            await zchToken.connect(user1).purchase({value: 3000});
            await zchToken.connect(user2).purchase({value: 4000});
            await zchToken.connect(user3).purchase({value: 8000});

            expect(await zchToken.dividendsOf(await user0.getAddress())).to.equal(5000);
            expect(await zchToken.dividendsOf(await user1.getAddress())).to.equal(6000);
            expect(await zchToken.dividendsOf(await user2.getAddress())).to.equal(4000);
            expect(await zchToken.dividendsOf(await user3.getAddress())).to.equal(0);
        });

        it("Allows users to retain earned dividends when transferring", async () => {
            let [from, to, potStirrer /* sumpunk */] = accounts;

            await zchToken.connect(from).purchase({value: 1000});
            await zchToken.connect(to).purchase({value: 3000});
            await zchToken.connect(potStirrer).purchase({value: 4000});

            await zchToken.connect(from).transfer(await to.getAddress(), 100000);

            expect(await zchToken.dividendsOf(await from.getAddress())).to.equal(4000);
            expect(await zchToken.dividendsOf(await to.getAddress())).to.equal(3000);
        });

        it("Allows users to withdraw their dividends", async () => {
            let [user0, user1] = accounts;

            await zchToken.connect(user0).purchase({value: 1000, gasPrice: 0});
            await zchToken.connect(user1).purchase({value: 3000, gasPrice: 0});

            await expect(() => zchToken.connect(user0).withdraw({gasPrice: 0})).to.changeBalance(user0, 3000);
            expect(await zchToken.dividendsOf(await user0.getAddress())).to.equal(0);
        });
    })
});
