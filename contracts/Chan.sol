pragma solidity ^0.6.1;
pragma experimental ABIEncoderV2;

library IPFS {

    /**
     * The length of a multihash header in bytes.
     */
    uint constant MULTIHASH_HEADER_LEN = 2;

    /**
     * A structure which represents a multihash which is a format used to wrap the digest of various different hashing
     * algorithms. The length is omitted since it is implied by the length of the data array.
     */
    struct MultiHash {

        /**
         * The hash function code.
         */
        uint8 fn;

        /**
         * The digest bytes.
         */
        bytes digest;
    }

    /**
     * Extracts the raw multihash bytes from a byte array. This will also do sensible checks to ensure that the
     * provided data is valid by checking that the byte array has the required amount of data.
     */
    function extractRawMultiHash(bytes memory data)
        internal
        pure
        returns (bytes memory)
    {
        require(data.length >= MULTIHASH_HEADER_LEN, "Bad length");

        uint8 len = uint8(data[1]);

        require(data.length - MULTIHASH_HEADER_LEN >= len, "Bad digest len");

        if (MULTIHASH_HEADER_LEN + len == data.length) {
            return data;
        }

        bytes memory cleaned = new bytes(MULTIHASH_HEADER_LEN + len);
        for (uint i = 0; i < 2 + len; i++) {
            cleaned[i] = data[i];
        }

        return cleaned;
    }

    /**
     * Decodes a byte array into a multihash struct.
     */
    function decodeMultiHash(bytes memory data) internal pure returns (MultiHash memory) {
        require(data.length >= MULTIHASH_HEADER_LEN, "Bad length");

        (uint8 fn, uint8 len) = (uint8(data[0]), uint8(data[1]));

        require(data.length - MULTIHASH_HEADER_LEN >= len, "Bad digest len");

        bytes memory digest = new bytes(len);
        for (uint i = 0; i < len; i++) {
            digest[i] = data[MULTIHASH_HEADER_LEN + i];
        }

        return MultiHash(fn, digest);
    }

    /**
     * Encodes a multihash into a byte array.
     */
    function encodeMultiHash(MultiHash memory multihash) internal pure returns (bytes memory) {
        bytes memory encoded = new bytes(multihash.digest.length + MULTIHASH_HEADER_LEN);
        encoded[0] = byte(multihash.fn);
        encoded[1] = byte(uint8(multihash.digest.length));

        for(uint i = 0; i < multihash.digest.length; i++) {
            encoded[2 + i] = multihash.digest[i];
        }

        return encoded;
    }
}

/**
 * A contract which is used to store announcements made on the landing page.
 */
contract ChanAnnouncements {

    /**
     * A struct which represents an announcement made on the landing page.
     */
    struct Announcement {

        /**
         * The address which authored the announcement.
         */
        address author;

        /**
         * The IPFS multihash which is used to derive the content identifier to access the announcement text.
         */
        bytes multihash;

        /**
         * The time at which the announcement was made as provided by the block timestamp.
         */
        uint timestamp;
    }

    /**
     * An event which is emitted when ownership of the contract is transferred.
     */
    event OwnershipTransferred(address indexed _previousOwner, address indexed _newOwner);

    /**
     * An event which is emitted when an address is whitelisted to make announcements.
     */
    event AnnouncerWhitelisted(address indexed _address);

    /**
     * An event which is emitted when an account is unwhitelisted to make announcements.
     */
    event AnnouncerBlacklisted(address indexed _address);

    /**
     * An event which is emitted when an announcement is published.
     */
    event AnnouncementPublished(address indexed _author, bytes _multihash, uint indexed _timestamp);

    /**
     * The current owner of the contract. On initialization this is set to the message sender.
     */
    address public owner;

    /**
     * Addresses which are whitelisted to make announcements.
     */
    mapping(address => bool) public announcers;

    /**
     * All of the announcements that were committed.
     */
    mapping(uint256 => Announcement) public announcements;

    /**
     * The number of announcements that have been made.
     */
    uint256 public announcementCount;

    constructor() public {
        owner = msg.sender;
    }

    modifier isOwner() {
        require(owner == msg.sender, "You are not the owner");
        _;
    }

    modifier isAnnouncer() {
        if (msg.sender != owner) {
            require(announcers[msg.sender], "You are not an announcer");
        }
        _;
    }

    /**
     * Transfers ownership of the contract to another address. Message sender must be the current owner for this
     * to work otherwise the transaction will revert.
     */
    function transferOwnership(address newOwner)
        public
        isOwner
    {
        require(owner != newOwner, "Already owner");

        address previousOwner = owner;
        owner = newOwner;

        emit OwnershipTransferred(previousOwner, newOwner);
    }

    /**
     * Whitelists an address as being able to make announcements. Message sender must be the current owner for this
     * to work otherwise the transaction will revert. If the address was already whitelisted this effectively will
     * do nothing.
     */
    function whitelist(address addr)
        public
        isOwner
    {
        require(!announcers[addr], "Already whitelisted");

        announcers[addr] = true;

        emit AnnouncerWhitelisted(addr);
    }

    /**
     * Blacklists an address to make it so that they are not able to make announcements. Message sender must be the
     * current owner for this to work otherwise the transaction will revert. If the address was not already whitelisted
     * this effectively will do nothing.
     */
    function blacklist(address addr)
        public
        isOwner
    {
        require(announcers[addr], "Already blacklisted");
        announcers[addr] = false;

        emit AnnouncerBlacklisted(addr);
    }

    /**
     * Publishes an announcement. In order to publish an announcement the message sender must be either an owner or
     * whitelisted to be an announcer.
     */
    function publishAnnouncement(bytes memory multihash)
        public
        isAnnouncer
    {
        multihash = IPFS.extractRawMultiHash(multihash);

        address author = msg.sender;
        uint timestamp = block.timestamp;

        uint announcementID = announcementCount + 1;
        announcements[announcementID] = Announcement(author, multihash, timestamp);
        announcementCount += 1;

        emit AnnouncementPublished(author, multihash, timestamp);
    }

    /**
     * Retrieves the latest announcement.
     */
    function getLatestAnnouncement()
        public
        view
        returns (Announcement memory)
    {
        return announcements[announcementCount];
    }
}

/**
 * A contract which contains all of the boards, threads, and posts.
 */
contract ChanBoards {

    /**
     * A numeric constant used for NULL identifiers.
     */
    uint32 constant public NULL = 0;

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
        bytes3 code;

        /**
         * The IPFS multihash which is used to derive the content identifier to access the board metadata.
         */
        bytes multihash;
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
         * The IPFS multihash which is used to derive the content identifier to access the post text.
         */
        bytes multihash;
    }

    /**
     * An event which is emitted when a new board is created.
     */
    event BoardCreated(address indexed creator, uint32 boardID, bytes3 code, bytes multihash);

    /**
     * An event which is emitted when a post is published to a thread.
     */
    event PostPublished(
        address indexed author,
        uint32  indexed boardID,
        uint32  indexed threadID,
        uint32          postID,
        uint16          ordinal,
        bytes           multihash
    );

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
    mapping(bytes3 => bool) public claimedBoardCodes;

    /**
     * All of the threads mapped first by board and then in order by which they were posted according to the number of
     * threads in the board.
     */
    mapping(uint32 => mapping(uint32 => uint32)) public boardThreads;

    /**
     * The number of threads that each board has.
     */
    mapping(uint32 => uint32) public boardThreadCounts;

    /**
     * The number of posts that currently exist by board.
     */
    mapping(uint32 => uint32) public boardPostCount;

    /**
     * All of the posts that exist mapped by board and then mapping by identifier.
     */
    mapping(uint32 => mapping(uint32 => Post)) public boardPosts;

    /**
     * All of the thread posts mapped first by board, then by the post which is the head of the thread, and finally by
     * order at which the posts were appended.
     */
    mapping(uint32 => mapping(uint32 => mapping(uint16 => uint32))) public boardThreadPosts;

    /**
     * The number of posts that the threads in a board currently has.
     */
    mapping(uint32 => mapping(uint32 => uint16)) public boardThreadPostCount;

    /**
     * Creates a new board.
     */
    function createBoard(bytes3 code, bytes memory multihash)
        public
        returns (uint32 boardID)
    {
        require(!claimedBoardCodes[code], "Board code already claimed");

        address creator = msg.sender;
        multihash = IPFS.extractRawMultiHash(multihash);

        boardID = boardCount + 1;
        boards[boardID] = Board(creator, code, multihash);
        boardCount += 1;

        claimedBoardCodes[code] = true;

        emit BoardCreated(creator, boardID, code, multihash);

        return boardID;
    }

    /**
     * Publishes a post. If the threadID is set to NULL then the post will be the first post in a newly created thread,
     * otherwise the post will be appended to a thread.
     */
    function publishPost(uint32 boardID, uint32 threadID, bytes memory multihash)
        public
        returns (uint32 postID)
    {
        require(boardID > 0 && boardID <= boardCount, "Board does not exist");

        if (threadID != NULL) {
            require(threadID > 0 && threadID <= boardThreadCounts[boardID], "Thread does not exist");
        }

        address author = msg.sender;
        multihash = IPFS.extractRawMultiHash(multihash);

        // Assign the post an identifier.
        postID = boardPostCount[boardID] + 1;

        // Create the thread if its new and append the thread to the board threads.
        if (threadID == NULL) {
            threadID = boardThreadCounts[boardID] + 1;
            boardThreadCounts[boardID] += 1;
        }

        // Create and write the post.
        boardPosts[boardID][postID] = Post(author, boardID, threadID, multihash);
        boardPostCount[boardID] += 1;

        // Append the post to the thread.
        uint16 ordinal = boardThreadPostCount[boardID][threadID] + 1;
        boardThreadPosts[boardID][threadID][ordinal] = postID;
        boardThreadPostCount[boardID][threadID] += 1;

        emit PostPublished(author, boardID, threadID, postID, ordinal, multihash);

        return postID;
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
     * Lists threads in a board.
     */
    function listThreads(uint32 boardID, uint32 cursor, uint32 limit)
        public
        view
        returns (uint32[] memory items, uint32 newCursor)
    {
        require(cursor > 0, "Bad cursor");
        require(boardID > 0 && boardID <= boardCount, "Board does not exist");
        require(limit > 0, "Bad limit");

        if (cursor + limit - 1 > boardThreadCounts[boardID]) {
            limit = boardThreadCounts[boardID] - cursor + 1;
        }

        items = new uint32[](limit);

        for (uint32 i = 0; i < limit; i++) {
            items[i] = boardThreads[boardID][i];
        }

        return (items, cursor + limit);
    }

    /**
     * Lists posts that belong to a board thread.
     */
    function listThreadPosts(uint32 boardID, uint32 threadID, uint16 cursor, uint16 limit)
        public
        view
        returns (Post[] memory items, uint16 newCursor)
    {
        require(cursor > 0, "Bad cursor");
        require(boardID > 0 && boardID <= boardCount, "Board does not exist");
        require(threadID > 0 && threadID <= boardThreadCounts[boardID], "Thread does not exist");
        require(limit > 0, "Bad limit");

        if (cursor + limit - 1 > boardThreadPostCount[boardID][threadID]) {
            limit = boardThreadPostCount[boardID][threadID] - cursor + 1;
        }

        items = new Post[](limit);

        for (uint16 i = 0; i < limit; i++) {
            items[i] = boardPosts[boardID][boardThreadPosts[boardID][threadID][cursor + i]];
        }

        return (items, cursor + limit);
    }
}
