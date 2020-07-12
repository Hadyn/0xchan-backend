pragma solidity ^0.6.8;
pragma experimental ABIEncoderV2;

/**
 * A contract which is used to store announcements made on the landing page.
 */
contract ZchAnns {

    /**
     * A struct which represents an announcement made on the landing page.
     */
    struct Announcement {

        /**
         * The address which authored the announcement.
         */
        address author;

        /**
         * The SHA3 hash which is used to derive the content identifier to access the announcement text.
         */
        bytes32 hash;
    }

    /**
     * An event which is emitted when ownership of the contract is transferred.
     */
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /**
     * An event which is emitted when an address is whitelisted to make announcements.
     */
    event AnnouncerWhitelisted(address indexed addr);

    /**
     * An event which is emitted when an account is unwhitelisted to make announcements.
     */
    event AnnouncerBlacklisted(address indexed addr);

    /**
     * An event which is emitted when an announcement is published.
     */
    event AnnouncementPublished(address indexed author, bytes32 hash);

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
    function publishAnnouncement(bytes32 hash)
        public
        isAnnouncer
    {
        address author = msg.sender;

        uint announcementID = announcementCount + 1;
        announcements[announcementID] = Announcement(author, hash);
        announcementCount += 1;

        emit AnnouncementPublished(author, hash);
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