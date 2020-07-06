pragma solidity ^0.6.1;

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
    mapping(uint256 => Announcement) internal announcements;

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
    function publishAnnouncement(bytes memory data)
        public
        isAnnouncer
    {
        bytes memory multihash = IPFS.extractRawMultiHash(data);

        address author = msg.sender;
        uint timestamp = block.timestamp;

        uint announcementID = announcementCount + 1;
        announcements[announcementID] = Announcement(author, multihash, timestamp);
        announcementCount += 1;

        emit AnnouncementPublished(author, data, timestamp);
    }

    /**
     * Retrieves an announcement. This will extract the fields from the announcement struct stored internally in the
     * contract into a tuple.
     */
    function getAnnouncement(uint id)
        public
        view
        returns (address author, bytes memory multihash, uint timestamp)
    {
        require(id > 0 && id <= announcementCount, "Bad ID");

        Announcement memory announcement = announcements[id];

        // Extract all the fields out of the announcement.
        return (
            announcement.author,
            announcement.multihash,
            announcement.timestamp
        );
    }

    /**
     * Retrieves the latest announcement. This will extract the fields from the announcement struct stored internally
     * in the contract into a tuple.
     */
    function getLatestAnnouncement()
        public
        view
        returns (address author, bytes memory multihash, uint timestamp)
    {
        return getAnnouncement(announcementCount);
    }
}
