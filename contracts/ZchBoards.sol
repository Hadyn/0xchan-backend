pragma solidity ^0.6.8;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/GSN/Context.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./ZchToken.sol";

/**
 * A contract which contains all of the boards, threads, and posts.
 */
contract ZchBoards {

    /**
     * A numeric constant used for NULL identifiers.
     */
    uint32 constant public NULL_ID = 0;

    /**
     * A bytes constant used for NULL hashes.
     */
    bytes32 constant public NULL_HASH = bytes32(0);

    /**
     * The number of times that a thread can be bumped before not being able to be bumped again.
     */
    uint256 constant public THREAD_POST_BUMP_LIMIT = 50;

    /**
     * The default maximum amount of ETH that a user can stake.
     */
    uint256 constant public DEFAULT_MAXIMUM_STAKE = 2 ether;

    /**
     * The default minimum amount of ETH that a user must have staked in order to post.
     */
    uint256 constant public DEFAULT_POST_TXT_STAKE_MINIMUM = 0.5 ether;

    /**
     * The default minimum amount of ETH that a user must have staked in order to post with an image.
     */
    uint256 constant public DEFAULT_POST_IMG_STAKE_MINIMUM = 1.5 ether;

    /**
     * The default price of creating a board using ethereum.
     */
    uint256 constant public DEFAULT_CREATE_BOARD_PRICE_WEI = 0.01 ether;

    /**
     * The default price of creating a board using ZCH.
     */
    uint256 constant public DEFAULT_CREATE_BOARD_PRICE_ZCH = 100;

    /**
     * The default price of publishing a post using ethereum.
     */
    uint256 constant public DEFAULT_PUBLISH_POST_PRICE_WEI = 0.0001 ether;

    /**
     * THe default price of publishing a post using ZCH.
     */
    uint256 constant public DEFAULT_PUBLISH_POST_PRICE_ZCH = 100;

    /**
     * A numeric enumeration which describes a privilege level for when a user can not post because they have an
     * insufficient stake.
     */
    uint256 constant public POSTING_PRIVILEGE_NONE = 0;

    /**
     * A numeric enumeration which describes a privilege level for when a user can only post text for the amount they
     * are staking with.
     */
    uint256 constant public POSTING_PRIVILEGE_TXT_ONLY = 1;

    /**
     * A numeric enumeration which describes a privilege level for when a user can post text with images for the amount
     * they are staking with.
     */
    uint256 constant public POSTING_PRIVILEGE_TXT_WITH_IMG = 2;

    /**
     * The function selector for the deposit function of the funds recipient.
     */
    bytes4 private DEPOSIT_SELECTOR = bytes4(keccak256(abi.encodePacked("deposit(bytes4)")));

    /**
     * A struct which represents a forum board.
     */
    struct Board {

        /**
         * The user which created the thread.
         */
        address creator;

        /**
         * The board code used for identifying the board.
         */
        bytes4 code;

        /**
         * The SHA3 hash which is used to derive the content identifier to access the board metadata.
         */
        bytes32 hash;
    }

    /**
     * A struct which represents a thread on a board.
     */
    struct Thread {

        /**
         * The previous thread in the ranking.
         */
        uint32 prevThreadID;

        /**
         * The next thread in the ranking.
         */
        uint32 nextThreadID;

        /**
         * The number of posts the thread currently has.
         */
        uint16 postCount;
    }

    /**
     * A struct which pairs a thread with its identifier.
     */
    struct ThreadWithID {
        uint32 id;
        Thread thread;
    }

    /**
     * A struct which represents a post made to a board.
     */
    struct Post {

        /**
         * The user which authored the post.
         */
        address author;

        /**
         * The board which the post belongs to.
         */
        uint32 boardID;

        /**
         * The thread which is the parent of this post.
         */
        uint32 threadID;

        /**
         * The SHA3 hash which is used to derive the content identifier to access the post text.
         */
        bytes32 txtHash;

        /**
         * The SHA3 hash which is used to derive the content identifier to access the post image.
         */
        bytes32 imgHash;
    }

    /**
     * A struct which pairs a post with its identifier.
     */
    struct PostWithID {
        uint32 id;
        Post post;
    }

    struct UserStats {

        /**
         * The number of posts that a user has made.
         */
        uint32 postCount;

        /**
         * The time in UNIX seconds that a user last made a post. If this is zero then the user has not yet posted.
         */
        uint64 lastPostTimestamp;
    }

    /**
     * An event which is emitted when a new board is created.
     */
    event BoardCreated(address indexed creator, uint32 boardID, bytes4 code, bytes32 hash);

    /**
     * An event which is emitted when a post is published to a thread.
     */
    event PostPublished(
        address indexed author,
        uint32  indexed boardID,
        uint32  indexed threadID,
        uint32          postID,
        uint16          ordinal,
        bytes32         txtHash,
        bytes32         imgHash
    );

    /**
     * An event which is emitted when ETH is deposited as a stake.
     */
    event StakeDeposited(address indexed staker, uint256 amount, uint256 total);

    /**
     * An event which is emitted when a stake is withdrawn.
     */
    event StakeWithdrawn(address indexed staker, uint256 amount);

    /**
     * The ZCH token contract.
     */
    IERC20 private _zchToken;

    /**
     * The contract which will store all the funds earned from this contract.
     */
    IFundsRecipient private _fundsRecipient;

    /**
     * The maximum amount of ethereum that a user can stake in wei.
     */
    uint256 public maximumStake;

    /**
     * The minimum amount of ethereum that a user must have staked in order to post.
     */
    uint256 public postTxtStakeMinimum;

    /**
     * The minimum amount of ethereum that a user must have staked in order to add attachments to posts.
     */
    uint256 public postImgStakeMinimum;

    /**
     * The price of creating a board in wei.
     */
    uint256 public createBoardPriceWei;

    /**
     * The price of creating a board in ZCH.
     */
    uint256 public createBoardPriceZch;

    /**
     * The price of publishing a post in wei.
     */
    uint256 public publishPostPriceWei;

    /**
     * The price of publishing a post in ZCH.
     */
    uint256 public publishPostPriceZch;

    /**
     * All of the boards that exist mapped by their identifier.
     */
    mapping(uint32 => Board) public boards;

    /**
     * The number of boards that currently exist.
     */
    uint32 public boardCount;

    /**
     * A set of all of the board codes that have been claimed.
     */
    mapping(bytes4 => bool) public claimedBoardCodes;

    /**
     * All of the posts that exist mapped by board and then mapped by identifier.
     */
    mapping(uint32 => mapping(uint32 => Post)) public boardPosts;

    /**
     * The number of posts that currently exist by board.
     */
    mapping(uint32 => uint32) public boardPostCount;

    /**
     * All of the threads that exist mapped by board and then mapped by identifier.
     */
    mapping(uint32 => mapping(uint32 => Thread)) public boardThreads;

    /**
     * The number of threads that each board has.
     */
    mapping(uint32 => uint32) public boardThreadCounts;

    /**
     * All of the thread posts mapped first by board, then by thread, and finally by order at which the posts were
     * appended.
     */
    mapping(uint32 => mapping(uint32 => mapping(uint16 => uint32))) public boardThreadPosts;

    /**
     * The current thread for each board that is the most recently updated or leader.
     */
    mapping(uint32 => uint32) public boardLeadingThread;

    /**
     * The amount of ethereum that each account currently has staked in wei.
     */
    mapping(address => uint256) public stakedAmounts;

    /**
     * The collection of all user stats mapped by address.
     */
    mapping(address => UserStats) public userStats;

    /**
     * The default constructor.
     */
    constructor(address _tokenAddress) public {
        _zchToken = IERC20(_tokenAddress);
        _fundsRecipient = IFundsRecipient(_tokenAddress);
        maximumStake = DEFAULT_MAXIMUM_STAKE;
        postTxtStakeMinimum = DEFAULT_POST_TXT_STAKE_MINIMUM;
        postImgStakeMinimum = DEFAULT_POST_IMG_STAKE_MINIMUM;
        createBoardPriceWei = DEFAULT_CREATE_BOARD_PRICE_WEI;
        createBoardPriceZch = DEFAULT_CREATE_BOARD_PRICE_ZCH;
        publishPostPriceWei = DEFAULT_PUBLISH_POST_PRICE_WEI;
        publishPostPriceZch = DEFAULT_PUBLISH_POST_PRICE_ZCH;
    }

    /**
     * Creates a new board through a payment of either ETH or ZCH. If any amount of ETH is sent to this function then
     * it is expected that the payment will be made solely using ETH, otherwise ZCH will be burned from the allowance
     * provided to this contract.
     */
    function createBoard(bytes4 code, bytes32 hash)
        public
        payable
    {
        address payable creator = msg.sender;
        bool etherSent = msg.value != 0;

        _beginPurchase(createBoardPriceWei, createBoardPriceZch);

        require(validateBoardCode(code), "Invalid board code");
        require(!claimedBoardCodes[code], "Board code already claimed");

        uint32 boardID = boardCount + 1;
        boards[boardID] = Board(creator, code, hash);
        boardCount += 1;

        claimedBoardCodes[code] = true;

        emit BoardCreated(creator, boardID, code, hash);

        _finalizePurchase(createBoardPriceWei, createBoardPriceZch);
    }

    /**
     * Publishes a post. If the threadID is set to NULL then the post will be the first post in a newly created thread,
     * otherwise the post will be appended to a thread.
     */
    function publishPost(uint32 boardID, uint32 threadID, bytes32 txtHash, bytes32 imgHash)
        public
        payable
    {
        address author = msg.sender;
        uint256 privilege = getPostingPrivilege(author);

        _beginPurchase(publishPostPriceWei, publishPostPriceZch);

        require(boardID > 0 && boardID <= boardCount, "Board does not exist");
        require(privilege >= POSTING_PRIVILEGE_TXT_ONLY, "Insufficient privilege to post");

        if (imgHash != NULL_HASH) {
            require(privilege >= POSTING_PRIVILEGE_TXT_WITH_IMG, "Insufficient privilege to post images");
        }

        if (threadID != NULL_ID) {
            require(threadID > 0 && threadID <= boardThreadCounts[boardID], "Thread does not exist");
        }

        Thread memory thread = boardThreads[boardID][threadID];
        if (threadID == NULL_ID) {
            threadID = boardThreadCounts[boardID] + 1;
            boardThreadCounts[boardID] += 1;
        }

        uint32 postID = boardPostCount[boardID] + 1;
        boardPosts[boardID][postID] = Post(author, boardID, threadID, txtHash, imgHash);
        boardPostCount[boardID] += 1;

        uint16 ordinal = thread.postCount + 1;
        thread.postCount  += 1;

        // Update the board leader if needed.
        uint32 currentLeadingThread = boardLeadingThread[boardID];
        if (currentLeadingThread != threadID && thread.postCount < THREAD_POST_BUMP_LIMIT) {
            // Relink the previous node's next node.
            if (thread.prevThreadID != NULL_ID) {
                boardThreads[boardID][thread.prevThreadID].nextThreadID = thread.nextThreadID;
            }

            // Relink the next node's previous node.
            if (thread.nextThreadID != NULL_ID) {
                boardThreads[boardID][thread.nextThreadID].prevThreadID = thread.prevThreadID;
            }

            // Relink the leading thread's previous node.
            if (currentLeadingThread != NULL_ID) {
                boardThreads[boardID][currentLeadingThread].prevThreadID = threadID;
            }

            thread.prevThreadID = NULL_ID;
            thread.nextThreadID = currentLeadingThread;

            boardLeadingThread[boardID] = threadID;
        }

        // Update or write the thread.
        boardThreads[boardID][threadID] = thread;
        boardThreadPosts[boardID][threadID][ordinal] = postID;

        // Update any user stats related to when a user makes a post.
        UserStats memory stats = userStats[author];
        stats.postCount += 1;
        stats.lastPostTimestamp = uint64(block.timestamp);
        userStats[author] = stats;

        emit PostPublished(author, boardID, threadID, postID, ordinal, txtHash, imgHash);

        _finalizePurchase(publishPostPriceWei, publishPostPriceZch);
    }

    /**
     * Deposits to the stake that a user has in the contract.
     */
    function depositStake() public payable {
        address payable staker = msg.sender;
        uint256 sentAmount = msg.value;
        uint256 amount = sentAmount;

        uint256 currentAmount = stakedAmounts[staker];
        if (currentAmount + amount > maximumStake) {
            amount = maximumStake - currentAmount;
        }

        uint256 updatedAmount = currentAmount + amount;
        stakedAmounts[staker] = updatedAmount;

        emit StakeDeposited(staker, amount, updatedAmount);

        uint256 refund = sentAmount - amount;
        if (refund > 0) {
            staker.transfer(refund);
        }
    }

    /**
     * Withdraws the stake that a user has in the contract.
     */
    function withdrawStake() public {
        address payable staker = msg.sender;

        uint256 amount = stakedAmounts[staker];
        require(amount > 0, "There is no stake to withdraw");
        stakedAmounts[staker] = 0;

        emit StakeWithdrawn(staker, amount);

        staker.transfer(amount);
    }

    /**
     * Gets the posting privilege that a user has based upon their current stake.
     */
    function getPostingPrivilege(address addr)
        public
        view
        returns (uint256 privilege)
    {
        uint256 amount = stakedAmounts[addr];

        if (amount >= postImgStakeMinimum) {
            return POSTING_PRIVILEGE_TXT_WITH_IMG;
        }

        if (amount >= postTxtStakeMinimum) {
            return POSTING_PRIVILEGE_TXT_ONLY;
        }

        return POSTING_PRIVILEGE_NONE;
    }

    /**
     * Lists boards.
     */
    function listBoards(uint32 cursor, uint32 limit)
        public
        view
        returns (Board[] memory items, uint32 newCursor)
    {
        require(cursor > 0, "Bad cursor");
        require(limit > 0, "Bad limit");

        if (cursor + limit - 1 > boardCount) {
            limit = boardCount - cursor + 1;
        }

        items = new Board[](limit);

        for (uint32 i = 0; i < limit; i++) {
            items[i] = boards[cursor + i];
        }

        return (items, cursor + limit);
    }

    /**
     * Lists all of the threads from a cursor onward ordered descending by most recent activity.
     */
    function listThreadsByActivity(uint32 boardID, uint32 cursor, uint32 limit)
        public
        view
        returns (ThreadWithID[] memory items, uint32 newCursor)
    {
        require(boardID > 0 && boardID <= boardCount, "Board does not exist");

        if (cursor != NULL_ID) {
            require(cursor <= boardThreadCounts[boardID], "Thread does not exist");
        }

        require(limit > 0, "Bad limit");

        if (cursor == NULL_ID) {
            cursor = boardLeadingThread[boardID];
        }

        items = new ThreadWithID[](limit);

        uint32 i = 0;
        while (cursor != NULL_ID && i < limit) {
            Thread memory thread = boardThreads[boardID][cursor];
            items[i] = ThreadWithID(cursor, thread);
            cursor = thread.nextThreadID;
            i += 1;
        }

        return (items, cursor);
    }

    /**
     * Lists posts that belong to a board thread.
     */
    function listThreadPosts(uint32 boardID, uint32 threadID, uint16 cursor, uint16 limit)
        public
        view
        returns (PostWithID[] memory items, uint16 newCursor)
    {
        require(cursor > 0, "Bad cursor");
        require(boardID > 0 && boardID <= boardCount, "Board does not exist");
        require(threadID > 0 && threadID <= boardThreadCounts[boardID], "Thread does not exist");
        require(limit > 0, "Bad limit");

        Thread memory thread = boardThreads[boardID][threadID];

        if (cursor + limit - 1 > thread.postCount) {
            limit = thread.postCount - cursor + 1;
        }

        items = new PostWithID[](limit);

        for (uint16 i = 0; i < limit; i++) {
            uint32 postID = boardThreadPosts[boardID][threadID][cursor + i];
            items[i] = PostWithID(postID, boardPosts[boardID][postID]);
        }

        return (items, cursor + limit);
    }

    /**
     * Validates a board code by assuring that all of its characters except the trailing characters after a null
     * character are lowercase alphabetical.
     */
    function validateBoardCode(bytes4 code) public pure returns (bool) {
        bool flag = false;
        for (uint256 i = 0; i < 4; i++) {
            if (code[i] == 0x00) {
                flag = true;
                continue;
            }

            if (flag) {
                return false;
            }

            // Lowercase a-z
            if (code[i] >= 0x61 && code[i] <= 0x7A) {
                continue;
            }

            return false;
        }

        return true;
    }

    /**
     * Start a purchase by determining if the user sent the proper amount of funds or has the correct amount of ZCH
     * provided.
     */
    function _beginPurchase(uint256 weiPrice, uint256 zchPrice) internal {
        if (msg.value != 0) {
            require(msg.value >= weiPrice, "Insufficient funds");
        } else {
            require(_zchToken.allowance(msg.sender, address(this)) >= zchPrice, "Insufficient ZCH allowance");
        }
    }

    /**
     * Clean up by refunding any extra ETH that was sent if the payment was made using ETH and depositing the purchase
     * made, and transfer any tokens to this contract that were used to purchase the resource. This function should
     * always be called last when making a purchase. The reason we transfer tokens last is to to generally prevent
     * reentry attacks.
     */
    function _finalizePurchase(uint256 weiPrice, uint256 zchPrice) internal {
        if (msg.value != 0) {
            require(
                _fundsRecipient.deposit{value: weiPrice}(DEPOSIT_SELECTOR),
                "Failed to deposit to external contract"
            );

            uint256 dust = SafeMath.sub(msg.value, weiPrice);
            if (dust > 0) {
                msg.sender.transfer(dust);
            }
        } else {
            require(_zchToken.transferFrom(msg.sender, address(this), zchPrice), "ZCH transfer failed");
        }
    }
}