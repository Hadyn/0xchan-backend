import chai from "chai";
import {deployContract, solidity} from "ethereum-waffle";
import {BigNumber, BigNumberish, BytesLike, Signer} from "ethers";
import {deployMockContract, MockContract} from '@ethereum-waffle/mock-contract';
import {ContractReceipt} from "@ethersproject/contracts";
import {ethers} from "@nomiclabs/buidler";

import BoardsArtifact from "../artifacts/ZchBoards.json";
import ZchTokenArtifact from "../artifacts/ZchToken.json";
import {ZchBoards} from "../types/ethers-contracts/ZchBoards"

chai.use(solidity);

const {expect} = chai;

describe("ZchBoards", () => {
    const ZERO_HASH: string = "0x0000000000000000000000000000000000000000000000000000000000000000";

    const BOARD_CODE: string = "0x62697a00";  // biz
    const BOARD_HASH: string = "0x6e44a07a9543467fd2894c29258bc5a97dcfc9db43dd9c922cf9d48cab04bcc1";

    const POST_TXT_HASH: string = "0x72c9183299776ac46c260537230d2108df3d81871ba61ebf1c5a2f3ae095e7a1";
    const POST_IMG_HASH: string = "0x7eb0ba0d19050c5c431e9b53c27f1b5d9bae7bc2fd9a8c869770bb0272e36757";

    const ZERO: BigNumber = BigNumber.from(0);

    let token: MockContract;
    let boards: ZchBoards;

    let owner: Signer;
    let accounts: Signer[];

    beforeEach(async () => {
        [owner, ...accounts] = await ethers.getSigners();

        token = await deployMockContract(owner, ZchTokenArtifact.abi);
        await token.mock.deposit.returns(true);

        boards = await deployContract(
            owner,
            BoardsArtifact,
            [token.address],
        ) as ZchBoards;
    });

    describe("Boards", () => {
        it("Allows the creation of boards using ETH", async () => {
            let [creator] = accounts;

            await boards.connect(creator).createBoard(
                BOARD_CODE,
                BOARD_HASH,
                {value: await boards.createBoardPriceWei()}
            );

            const {creator: creatorAddress, code, hash} = await boards.boards(1);

            expect(creatorAddress).to.equal(await creator.getAddress());
            expect(code).to.equal(BOARD_CODE);
            expect(hash).to.equal(BOARD_HASH);
        });

        it("Allows the creation of boards using ZCH", async () => {
            let [creator] = accounts;

            const boardCreationPriceZch = await boards.createBoardPriceZch();

            await token.mock.allowance
                .withArgs(await creator.getAddress(), boards.address)
                .returns(boardCreationPriceZch);

            await token.mock.transferFrom
                .returns(true);

            await boards.connect(creator).createBoard(
                BOARD_CODE,
                BOARD_HASH,
                {value: 0}
            );

            const {creator: creatorAddress, code, hash} = await boards.boards(1);

            expect(creatorAddress).to.equal(await creator.getAddress());
            expect(code).to.equal(BOARD_CODE);
            expect(hash).to.equal(BOARD_HASH);
        });

        it("Only allows a board to be created if a sufficient amount of ETH is sent", async () => {
            let [creator] = accounts;

            const boardCreationPriceWei = await boards.createBoardPriceWei();

            await expect(boards
                .connect(creator)
                .createBoard(BOARD_CODE, BOARD_HASH, {value: boardCreationPriceWei.sub(1)}))
                .to.be.revertedWith("Insufficient funds");
        });

        it("Only allows a board to be created if a sufficient amount of ZCH is provided", async () => {
            let [creator] = accounts;

            const boardCreationPriceZch = await boards.createBoardPriceZch();

            await token.mock.allowance
                .withArgs(await creator.getAddress(), boards.address)
                .returns(boardCreationPriceZch.sub(1));

            await expect(boards
                .connect(creator)
                .createBoard(BOARD_CODE, BOARD_HASH, {value: 0}))
                .to.be.revertedWith("Insufficient ZCH");
        });

        it("Refunds any extra ETH sent to create a board", async () => {
            let [creator] = accounts;

            const boardCreationPriceWei = await boards.createBoardPriceWei();

            await expect(() => boards.connect(creator).createBoard(
                BOARD_CODE,
                BOARD_HASH,
                {value: boardCreationPriceWei.add(1), gasPrice: 0}
            )).to.changeBalance(creator, ZERO.sub(boardCreationPriceWei) /* ethers pls add negate :( */);
        });

        it("Emits an event when a board is created", async () => {
            let [creator] = accounts;

            const createBoardPriceWei = await boards.createBoardPriceWei();

            expect(boards.connect(creator).createBoard(BOARD_CODE, BOARD_HASH, {value: createBoardPriceWei}))
                .to.emit(boards, "BoardCreated")
                .withArgs(await creator.getAddress(), 1, BOARD_CODE, BOARD_HASH);
        });

        it("Only allows a board to be created if its code is unique", async () => {
            let [creator] = accounts;

            const createBoardPriceWei = await boards.createBoardPriceWei();

            await boards.connect(creator).createBoard(BOARD_CODE, BOARD_HASH, {value: createBoardPriceWei});
            await expect(
                boards.connect(creator).createBoard(BOARD_CODE, BOARD_HASH, {value: createBoardPriceWei})
            ).to.be.revertedWith("Board code already claimed");
        });

        describe("Codes", () => {
            it("Correctly identifiers a board code as invalid when it has intermittent whitespace", async () => {
                expect(await boards.validateBoardCode("0x7a007a00")).to.be.false;
            });

            it("Correctly identifiers a board code as invalid when contains invalid characters", async () => {
                expect(await boards.validateBoardCode("0x7a7a5a00")).to.be.false;
            });
        });
    });

    describe("Staking", () => {
        it("Allows users to stake", async () => {
            let [staker] = accounts;

            const maximumStake = await boards.maximumStake();

            await boards.connect(staker).depositStake({value: maximumStake});
            expect(await boards.stakedAmounts(await staker.getAddress())).to.equal(maximumStake);
        });

        it("Refunds any extra ETH sent deposited to stake", async () => {
            let [staker] = accounts;

            const maximumStake = await boards.maximumStake();

            await expect(() => boards.connect(staker).depositStake(
                {value: maximumStake.add(1), gasPrice: 0}
            )).to.changeBalance(staker, ZERO.sub(maximumStake) /* ethers pls add negate :( */);
        });

        it("Emits an event when a stake is deposited", async () => {
            let [staker] = accounts;

            const maximumStake = await boards.maximumStake();

            expect(boards.connect(staker).depositStake({value: maximumStake}))
                .to.emit(boards, "StakeDeposited")
                .withArgs(await staker.getAddress(), maximumStake, maximumStake);
        });

        it("Allows users to withdraw their stake", async () => {
            let [staker] = accounts;

            const maximumStake = await boards.maximumStake();
            const startingBalance = await staker.getBalance();

            await boards.connect(staker).depositStake({value: maximumStake, gasPrice: 0});
            await boards.connect(staker).withdrawStake({gasPrice: 0});
            expect(await staker.getBalance()).to.equal(startingBalance);
        });

        it("Only allows users to withdraw their stake if they have a stake", async () => {
            let [staker] = accounts;

            const maximumStake = await boards.maximumStake();

            await boards.connect(staker).depositStake({value: maximumStake});
            await boards.connect(staker).withdrawStake();

            await expect(
                boards.connect(staker).withdrawStake()
            ).to.revertedWith("There is no stake to withdraw");
        });

        it("Emits an event when a stake is withdrawn", async () => {
            let [staker] = accounts;

            const maximumStake = await boards.maximumStake();

            await boards.connect(staker).depositStake({value: maximumStake});

            expect(boards.connect(staker).withdrawStake())
                .to.emit(boards, "StakeWithdrawn")
                .withArgs(await staker.getAddress(), maximumStake);
        });

        it("Correctly identifies when a user cannot post", async () => {
            let [user] = accounts;

            expect(await boards.getPostingPrivilege(await user.getAddress()))
                .to.equal(await boards.POSTING_PRIVILEGE_NONE());
        });

        it("Correctly identifies when a user can post text", async () => {
            let [user] = accounts;

            const postTxtStakeMinimum = await boards.postTxtStakeMinimum();

            await boards.connect(user).depositStake({value: postTxtStakeMinimum});

            expect(await boards.getPostingPrivilege(await user.getAddress()))
                .to.equal(await boards.POSTING_PRIVILEGE_TXT_ONLY());
        });

        it("Correctly identifies when a user can post text with images", async () => {
            let [user] = accounts;

            const postImgStakeMinimum = await boards.postImgStakeMinimum();

            await boards.connect(user).depositStake({value: postImgStakeMinimum});

            expect(await boards.getPostingPrivilege(await user.getAddress()))
                .to.equal(await boards.POSTING_PRIVILEGE_TXT_WITH_IMG());
        });
    });

    describe("Posting", () => {
        const setupStakeAndBoard = async (account: Signer) => {
            return setupStakeAndBoardWithStakeAmount(account, await boards.maximumStake());
        };

        const setupStakeAndBoardWithStakeAmount = async (account: Signer, stakeAmount: BigNumber) => {
            await boards.connect(account).depositStake({value: stakeAmount});
            await boards.connect(account).createBoard(
                BOARD_CODE,
                BOARD_HASH,
                {value: await boards.createBoardPriceWei()}
            );
        };

        it("Allows users to post using ETH", async () => {
            let [author] = accounts;

            await setupStakeAndBoard(author);

            await boards.connect(author).publishPost(
                1,
                0,
                POST_TXT_HASH,
                POST_IMG_HASH,
                {value: await boards.publishPostPriceWei()}
            );

            const {author: authorAddr, boardID, threadID, txtHash, imgHash} = await boards.boardPosts(1, 1);

            expect(authorAddr).to.equal(await author.getAddress());
            expect(boardID).to.equal(1);
            expect(threadID).to.equal(1);
            expect(txtHash).to.equal(POST_TXT_HASH);
            expect(imgHash).to.equal(POST_IMG_HASH);

            expect(await boards.boardPostCount(boardID)).to.equal(1);
            expect(await boards.boardThreadCounts(boardID)).to.equal(1);
            expect(await boards.boardThreadPosts(boardID, threadID, 1)).to.equal(1);
        });

        it("Allows users to post using ZCH", async () => {
            let [author] = accounts;

            await setupStakeAndBoard(author);

            await token.mock.allowance
                .withArgs(await author.getAddress(), boards.address)
                .returns(await boards.publishPostPriceZch());

            await token.mock.transferFrom
                .returns(true);

            await boards.connect(author).publishPost(
                1,
                0,
                POST_TXT_HASH,
                POST_IMG_HASH,
                {value: 0}
            );

            const {author: authorAddr, boardID, threadID, txtHash, imgHash} = await boards.boardPosts(1, 1);

            expect(authorAddr).to.equal(await author.getAddress());
            expect(boardID).to.equal(1);
            expect(threadID).to.equal(1);
            expect(txtHash).to.equal(POST_TXT_HASH);
            expect(imgHash).to.equal(POST_IMG_HASH);

            expect(await boards.boardPostCount(boardID)).to.equal(1);
            expect(await boards.boardThreadCounts(boardID)).to.equal(1);
            expect(await boards.boardThreadPosts(boardID, threadID, 1)).to.equal(1);
        });

        it("Allows users to append posts to threads", async () => {
            let [author] = accounts;

            await setupStakeAndBoard(author);

            const publishPostPriceWei = await boards.publishPostPriceWei();

            await boards.connect(author).publishPost(
                1,
                0,
                ZERO_HASH,
                ZERO_HASH,
                {value: publishPostPriceWei}
            );

            await boards.connect(author).publishPost(
                1,
                1,
                POST_TXT_HASH,
                POST_IMG_HASH,
                {value: publishPostPriceWei}
            );

            const {author: authorAddr, boardID, threadID, txtHash, imgHash} = await boards.boardPosts(1, 2);

            expect(authorAddr).to.equal(await author.getAddress());
            expect(boardID).to.equal(1);
            expect(threadID).to.equal(1);
            expect(txtHash).to.equal(POST_TXT_HASH);
            expect(imgHash).to.equal(POST_IMG_HASH);

            expect(await boards.boardPostCount(boardID)).to.equal(2);
            expect(await boards.boardThreadCounts(boardID)).to.equal(1);
            expect(await boards.boardThreadPosts(boardID, threadID, 2)).to.equal(2);
        });

        it("Emits an event when a post is published", async () => {
            let [author] = accounts;

            await setupStakeAndBoard(author);

            await expect(boards.connect(author).publishPost(
                1,
                0,
                POST_TXT_HASH,
                POST_IMG_HASH,
                {value: await boards.publishPostPriceWei()}
            )).to.emit(boards, "PostPublished")
                .withArgs(await author.getAddress(), 1, 1, 1, 1, POST_TXT_HASH, POST_IMG_HASH);
        });

        it("Emits an event when a post is appended to a thread", async () => {
            let [author] = accounts;

            await setupStakeAndBoard(author);

            await boards.connect(author).publishPost(
                1,
                0,
                ZERO_HASH,
                ZERO_HASH,
                {value: await boards.publishPostPriceWei()}
            );

            await expect(boards.connect(author).publishPost(
                1,
                1,
                POST_TXT_HASH,
                POST_IMG_HASH,
                {value: await boards.publishPostPriceWei()}
            )).to.emit(boards, "PostPublished")
                .withArgs(await author.getAddress(), 1, 1, 2, 2, POST_TXT_HASH, POST_IMG_HASH);
        });

        it("Bumps a thread when a post is made", async () => {
            let [author] = accounts;

            await setupStakeAndBoard(author);

            await boards.connect(author).publishPost(
                1,
                0,
                ZERO_HASH,
                ZERO_HASH,
                {value: await boards.publishPostPriceWei()}
            );

            await boards.connect(author).publishPost(
                1,
                0,
                ZERO_HASH,
                ZERO_HASH,
                {value: await boards.publishPostPriceWei()}
            );

            await boards.connect(author).publishPost(
                1,
                0,
                ZERO_HASH,
                ZERO_HASH,
                {value: await boards.publishPostPriceWei()}
            );

            await boards.connect(author).publishPost(
                1,
                2,
                ZERO_HASH,
                ZERO_HASH,
                {value: await boards.publishPostPriceWei()}
            );

            expect(await boards.boardLeadingThread(1)).to.equal(2);
        });

        it("Only bumps a thread when it is below its bump limit", async () => {
            let [author] = accounts;

            await setupStakeAndBoard(author);

            const publishPost = async (
                author: Signer,
                boardID: BigNumberish,
                threadID: BigNumberish,
                txtHash: BytesLike,
                imgHash: BytesLike): Promise<ContractReceipt> =>
            {
                const transaction = await boards.connect(author).publishPost(
                    boardID,
                    threadID,
                    txtHash,
                    imgHash,
                    {value: await boards.publishPostPriceWei()}
                );

                return transaction.wait();
            };

            const POST_BUMP_LIMIT = await boards.THREAD_POST_BUMP_LIMIT();

            await publishPost(author, 1, 0, POST_TXT_HASH, POST_IMG_HASH);
            for (let i = 0; i < POST_BUMP_LIMIT.toNumber() - 1; i++) {
                await publishPost(author, 1, 1, POST_TXT_HASH, POST_IMG_HASH);
            }

            await publishPost(author, 1, 0, POST_TXT_HASH, POST_IMG_HASH);
            await publishPost(author, 1, 1, POST_TXT_HASH, POST_IMG_HASH);

            expect(await boards.boardLeadingThread(1)).to.equal(2);
        });

        it("Only allows users to post to threads that exist", async () => {
            let [author] = accounts;

            await setupStakeAndBoard(author);

            await expect(boards.connect(author).publishPost(
                1,
                1,
                POST_TXT_HASH,
                ZERO_HASH,
                {value: await boards.publishPostPriceWei()}
            )).to.revertedWith("Thread does not exist");
        });

        it("Only allows users to post when they have a sufficient stake", async () => {
            let [author] = accounts;

            const stakeMinimum = await boards.postTxtStakeMinimum();
            await setupStakeAndBoardWithStakeAmount(author, stakeMinimum.sub(1));

            await expect(boards.connect(author).publishPost(
                1,
                0,
                POST_TXT_HASH,
                ZERO_HASH,
                {value: await boards.publishPostPriceWei()}
            )).to.revertedWith("Insufficient privilege to post");
        });

        it("Only allows users to post with images when they have a sufficient stake", async () => {
            let [author] = accounts;

            const stakeMinimum = await boards.postImgStakeMinimum();
            await setupStakeAndBoardWithStakeAmount(author, stakeMinimum.sub(1));

            await expect(boards.connect(author).publishPost(
                1,
                0,
                POST_TXT_HASH,
                POST_IMG_HASH,
                {value: await boards.publishPostPriceWei()}
            )).to.revertedWith("Insufficient privilege to post images");
        });
    });

    describe("Querying", () => {
        const setupStake = async (staker: Signer): Promise<ContractReceipt> => {
            const transaction = await boards.connect(staker).depositStake({value: await boards.maximumStake()});
            return transaction.wait();
        };

        const createBoard = async (creator: Signer, code: BytesLike, hash: BytesLike): Promise<ContractReceipt> => {
            const transaction = await boards.connect(creator).createBoard(
                code,
                hash,
                {value: await boards.createBoardPriceWei()}
            );

            return transaction.wait();
        };

        const publishPost = async (
            author: Signer,
            boardID: BigNumberish,
            threadID: BigNumberish,
            txtHash: BytesLike,
            imgHash: BytesLike): Promise<ContractReceipt> =>
        {
            const transaction = await boards.connect(author).publishPost(
                boardID,
                threadID,
                txtHash,
                imgHash,
                {value: await boards.publishPostPriceWei()}
            );

            return transaction.wait();
        };

        it("Retrieves a list of boards", async () => {
            let [account] = accounts;

            const address: string = await account.getAddress();

            const BOARD_CODE_0 = "0x61000000";
            const BOARD_CODE_1 = "0x62000000";
            const BOARD_CODE_2 = "0x63000000";
            const BOARD_CODE_3 = "0x64000000";
            const BOARD_CODE_4 = "0x65000000";

            const BOARD_HASH_0 = "0x0000000000000000000000000000000000000000000000000000000000000000";
            const BOARD_HASH_1 = "0x0000000000000000000000000000000000000000000000000000000000000001";
            const BOARD_HASH_2 = "0x0000000000000000000000000000000000000000000000000000000000000002";
            const BOARD_HASH_3 = "0x0000000000000000000000000000000000000000000000000000000000000003";
            const BOARD_HASH_4 = "0x0000000000000000000000000000000000000000000000000000000000000004";

            await createBoard(account, BOARD_CODE_0, BOARD_HASH_0);
            await createBoard(account, BOARD_CODE_1, BOARD_HASH_1);
            await createBoard(account, BOARD_CODE_2, BOARD_HASH_2);
            await createBoard(account, BOARD_CODE_3, BOARD_HASH_3);
            await createBoard(account, BOARD_CODE_4, BOARD_HASH_4);

            const {items: firstQueryItems, newCursor} = await boards.listBoards(1, 2);
            expect(firstQueryItems.length).to.equal(2);
            expect(newCursor).to.equal(3);

            const validateBoard = (
                board: {
                    creator: string;
                    code: string;
                    hash: string;
                    0: string;
                    1: string;
                    2: string;
                },
                expectedCreator: string,
                expectedCode: string,
                expectedHash: string) =>
            {
                const { creator, code, hash } = board;
                expect(creator).to.equal(expectedCreator);
                expect(code).to.equal(expectedCode);
                expect(hash).to.equal(expectedHash);
            };

            validateBoard(firstQueryItems[0], address, BOARD_CODE_0, BOARD_HASH_0);
            validateBoard(firstQueryItems[1], address, BOARD_CODE_1, BOARD_HASH_1);

            const {items: secondQueryItems, newCursor: finalCursor} = await boards.listBoards(newCursor, 500);
            expect(secondQueryItems.length).to.equal(3);
            expect(finalCursor).to.equal(6);

            validateBoard(secondQueryItems[0], address, BOARD_CODE_2, BOARD_HASH_2);
            validateBoard(secondQueryItems[1], address, BOARD_CODE_3, BOARD_HASH_3);
            validateBoard(secondQueryItems[2], address, BOARD_CODE_4, BOARD_HASH_4);
        });

        it("Retrieves a list of threads sorted by activity", async () => {
            let [account] = accounts;

            await setupStake(account);
            await createBoard(account, BOARD_CODE, BOARD_HASH);

            await publishPost(account, 1, 0, POST_TXT_HASH, POST_IMG_HASH);
            await publishPost(account, 1, 0, POST_TXT_HASH, POST_IMG_HASH);
            await publishPost(account, 1, 0, POST_TXT_HASH, POST_IMG_HASH);
            await publishPost(account, 1, 0, POST_TXT_HASH, POST_IMG_HASH);
            await publishPost(account, 1, 0, POST_TXT_HASH, POST_IMG_HASH);

            // Order: [4, 5, 1, 2, 3]
            await publishPost(account, 1, 3, POST_TXT_HASH, POST_IMG_HASH);
            await publishPost(account, 1, 2, POST_TXT_HASH, POST_IMG_HASH);
            await publishPost(account, 1, 1, POST_TXT_HASH, POST_IMG_HASH);
            await publishPost(account, 1, 5, POST_TXT_HASH, POST_IMG_HASH);
            await publishPost(account, 1, 4, POST_TXT_HASH, POST_IMG_HASH);

            const validateThread = (
                outer: {
                    id: number;
                    thread: {
                        prevThreadID: number;
                        nextThreadID: number;
                        postCount: number;
                        0: number;
                        1: number;
                        2: number;
                    };
                    0: number;
                    1: {
                        prevThreadID: number;
                        nextThreadID: number;
                        postCount: number;
                        0: number;
                        1: number;
                        2: number;
                    };
                },
                expectedID: number,
                expectedPrevThreadID: number,
                expectedNextThreadID: number,
                expectedPostCount: number) =>
            {
                expect(outer.id).to.equal(expectedID);

                const { prevThreadID, nextThreadID, postCount } = outer.thread;
                expect(prevThreadID).to.equal(expectedPrevThreadID);
                expect(nextThreadID).to.equal(expectedNextThreadID);
                expect(postCount).to.equal(expectedPostCount);
            };

            const {items: firstQueryItems, newCursor} = await boards.listThreadsByActivity(1, 0, 2);
            expect(newCursor).to.equal(1);

            validateThread(firstQueryItems[0], 4, 0, 5, 2);
            validateThread(firstQueryItems[1], 5, 4, 1, 2);

            const {items: secondQueryItems, newCursor: finalCursor} = await boards.listThreadsByActivity(1, newCursor, 500);
            expect(finalCursor).to.equal(0);

            validateThread(secondQueryItems[0], 1, 5, 2, 2);
            validateThread(secondQueryItems[1], 2, 1, 3, 2);
            validateThread(secondQueryItems[2], 3, 2, 0, 2);
        });

        it("Retrieves a list of posts in a thread", async () => {
            let [account] = accounts;

            const address: string = await account.getAddress();

            const POST_TXT_HASH_0 = "0x0000000000000000000000000000000000000000000000000000000000000000";
            const POST_TXT_HASH_1 = "0x0000000000000000000000000000000000000000000000000000000000000001";
            const POST_TXT_HASH_2 = "0x0000000000000000000000000000000000000000000000000000000000000002";
            const POST_TXT_HASH_3 = "0x0000000000000000000000000000000000000000000000000000000000000003";
            const POST_TXT_HASH_4 = "0x0000000000000000000000000000000000000000000000000000000000000004";

            const POST_IMG_HASH_0 = "0x0000000000000000000000000000000000000000000000000000000000000005";
            const POST_IMG_HASH_1 = "0x0000000000000000000000000000000000000000000000000000000000000006";
            const POST_IMG_HASH_2 = "0x0000000000000000000000000000000000000000000000000000000000000007";
            const POST_IMG_HASH_3 = "0x0000000000000000000000000000000000000000000000000000000000000008";
            const POST_IMG_HASH_4 = "0x0000000000000000000000000000000000000000000000000000000000000009";

            await setupStake(account);
            await createBoard(account, BOARD_CODE, BOARD_HASH);

            await publishPost(account, 1, 0, POST_TXT_HASH_0, POST_IMG_HASH_0);
            await publishPost(account, 1, 1, POST_TXT_HASH_1, POST_IMG_HASH_1);
            await publishPost(account, 1, 1, POST_TXT_HASH_2, POST_IMG_HASH_2);
            await publishPost(account, 1, 1, POST_TXT_HASH_3, POST_IMG_HASH_3);
            await publishPost(account, 1, 1, POST_TXT_HASH_4, POST_IMG_HASH_4);

            const {items: firstQueryItems, newCursor} = await boards.listThreadPosts(1, 1, 1, 2);
            expect(firstQueryItems.length).to.equal(2);
            expect(newCursor).to.equal(3);

            const validatePost = (
                outer: {
                    id: number;
                    post: {
                        author: string;
                        boardID: number;
                        threadID: number;
                        txtHash: string;
                        imgHash: string;
                        0: string;
                        1: number;
                        2: number;
                        3: string;
                        4: string;
                    };
                    0: number;
                    1: {
                        author: string;
                        boardID: number;
                        threadID: number;
                        txtHash: string;
                        imgHash: string;
                        0: string;
                        1: number;
                        2: number;
                        3: string;
                        4: string;
                    };
                },
                expectedAuthor: string,
                expectedBoardID: number,
                expectedThreadID: number,
                expectedTxtHash: string,
                expectedImgHash: string) =>
            {
                const { author, boardID, threadID, txtHash, imgHash } = outer.post;
                expect(author).to.equal(expectedAuthor);
                expect(boardID).to.equal(expectedBoardID);
                expect(threadID).to.equal(expectedThreadID);
                expect(txtHash).to.equal(expectedTxtHash);
                expect(imgHash).to.equal(expectedImgHash);
            };

            validatePost(firstQueryItems[0], address, 1, 1, POST_TXT_HASH_0, POST_IMG_HASH_0);
            validatePost(firstQueryItems[1], address, 1, 1, POST_TXT_HASH_1, POST_IMG_HASH_1);

            const {items: secondQueryItems, newCursor: finalCursor} = await boards.listThreadPosts(1, 1, newCursor, 500);
            expect(secondQueryItems.length).to.equal(3);
            expect(finalCursor).to.equal(6);

            validatePost(secondQueryItems[0], address, 1, 1, POST_TXT_HASH_2, POST_IMG_HASH_2);
            validatePost(secondQueryItems[1], address, 1, 1, POST_TXT_HASH_3, POST_IMG_HASH_3);
            validatePost(secondQueryItems[2], address, 1, 1, POST_TXT_HASH_4, POST_IMG_HASH_4);
        });
    });

    describe("Users", () => {
        const setupPosterAndPost = async (poster: Signer): Promise<ContractReceipt> => {
            await boards.connect(poster).depositStake({value: await boards.maximumStake()});
            await boards.connect(poster).createBoard(
                BOARD_CODE,
                BOARD_HASH,
                {value: await boards.createBoardPriceWei()}
            );

            const transaction = await boards.connect(poster).publishPost(
                1,
                0,
                POST_TXT_HASH,
                POST_IMG_HASH,
                {value: await boards.publishPostPriceWei()}
            );

            return transaction.wait();
        };

        it("Tracks the number of posts a user makes", async () => {
            let [poster] = accounts;

            let {postCount: startingPostCount} = await boards.userStats(await poster.getAddress());
            expect(startingPostCount).to.equal(0);

            await setupPosterAndPost(poster);

            let {postCount} = await boards.userStats(await poster.getAddress());
            expect(postCount).to.equal(1);
        });

        it("Tracks the last time a user posts", async () => {
            let [poster] = accounts;

            const receipt = await setupPosterAndPost(poster);
            const block = await ethers.provider.getBlock(receipt.blockNumber);

            let {lastPostTimestamp} = await boards.userStats(await poster.getAddress());
            expect(lastPostTimestamp).to.equal(block.timestamp);
        });
    });

    describe("Moderation", () => {
        it.skip("Soon (TM)", async () => {

        })
    });
});
