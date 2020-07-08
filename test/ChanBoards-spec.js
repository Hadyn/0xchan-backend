/*global artifacts, contract, it*/

const ChanBoards = artifacts.require('ChanBoards');

let accounts;

// For documentation please see https://framework.embarklabs.io/docs/contracts_testing.html
config({
    //deployment: {
    //  accounts: [
    //    // you can configure custom accounts with a custom balance
    //    // see https://framework.embarklabs.io/docs/contracts_testing.html#Configuring-accounts
    //  ]
    //},
    libraries: ['IPFS'],
    contracts: {
        deploy: {
            ChanBoards: { args: [] }
        }
    }
}, (_err, web3_accounts) => {
    accounts = web3_accounts
});

contract("ChanBoards", function () {
    it("should create boards", async function () {
        const transaction = await ChanBoards.methods.createBoard("0xabcdef", "0x000100").send();
        assert.eventEmitted(
            transaction,
            'BoardCreated',
            {
                creator: accounts[0],
                boardID: "1",
                code: "0xabcdef",
                multihash: "0x000100"
            }
        );

        const boardCount = await ChanBoards.methods.boardCount().call();
        assert.strictEqual(parseInt(boardCount, 10), 1);
    });

    it("should reject creating boards with the same code", async function () {
        await assert.reverts(
            ChanBoards.methods.createBoard("0xabcdef", "0x000100"),
            { from: accounts[0] },
            "Returned error: VM Exception while processing transaction: revert Board code already claimed"
        );
    });

    it("should create threads", async function () {
        const transaction = await ChanBoards.methods.publishPost(1, 0, "0x000100").send();
        assert.eventEmitted(
            transaction,
            'PostPublished',
            {
                author: accounts[0],
                boardID: "1",
                threadID: "1",
                postID: "1",
                multihash: "0x000100"
            }
        );

        const postCount = await ChanBoards.methods.boardPostCount(1).call();
        assert.strictEqual(parseInt(postCount, 10), 1);

        const boardThreadCount = await ChanBoards.methods.boardThreadCounts(1).call();
        assert.strictEqual(parseInt(boardThreadCount, 10), 1);

        const threadPostCount = await ChanBoards.methods.boardThreadPostCount(1, 1).call();
        assert.strictEqual(parseInt(threadPostCount, 10), 1);

        const threadPostID = await ChanBoards.methods.boardThreadPosts(1, 1, 1).call();
        assert.strictEqual(parseInt(threadPostID, 10), 1);
    });

    it("should append posts to threads", async function () {
        const transaction = await ChanBoards.methods.publishPost(1, 1, "0x000100").send();
        assert.eventEmitted(
            transaction,
            'PostPublished',
            {
                author: accounts[0],
                boardID: "1",
                threadID: "1",
                postID: "2",
                multihash: "0x000100"
            }
        );

        const postCount = await ChanBoards.methods.boardPostCount(1).call();
        assert.strictEqual(parseInt(postCount, 10), 2);

        const boardThreadCount = await ChanBoards.methods.boardThreadCounts(1).call();
        assert.strictEqual(parseInt(boardThreadCount, 10), 1);

        const threadPostCount = await ChanBoards.methods.boardThreadPostCount(1, 1).call();
        assert.strictEqual(parseInt(threadPostCount, 10), 2);

        const threadPostID = await ChanBoards.methods.boardThreadPosts(1, 1, 2).call();
        assert.strictEqual(parseInt(threadPostID, 10), 2);
    });
});
