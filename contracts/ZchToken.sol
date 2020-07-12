pragma solidity ^0.6.8;
pragma experimental ABIEncoderV2;

import "@nomiclabs/buidler/console.sol";
import "@openzeppelin/contracts/GSN/Context.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Burnable.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/utils/Address.sol";

interface IERC223Handler {
    function tokenFallback(address from, uint value, bytes calldata data) external;
}

interface IFundsRecipient {
    function deposit(bytes4 selector) external payable returns (bool) ;
}

/**
 * @dev A contract which provides all support for the ZCH token.
 */
contract ZchToken is Context, ERC20, IERC223Handler, IFundsRecipient {

    uint256 constant FIXED_POINT_RADIX = 10**18;
    uint256 constant TOKENS_PER_WEI = 100;

    /**
     * The key which must be sent to deposit in order for the deposit to be accepted. This is just a manner of trying
     * to limit people brainlessly using deposit without looking at what it may do.
     */
    bytes32 constant DEPOSIT_SELECTOR = bytes4(keccak256(abi.encodePacked("deposit(bytes4)")));

    /**
     * An event which is emitted when a deposit is received.
     */
    event FundsDeposited(address from, uint256 amount);

    /**
     * @dev The ZCI token contract.
     */
    IERC20 private _zciToken;

    /**
     * The aggregated sum of wei distributed across token holders. Each time ether is deposited to this contract,
     * the amount is split across all of the tokens that exist at that time. This is aggregated for each deposit
     * to give a value which then can be compared to snapshots on an account to account basis to give the a dividends
     * that each account has not yet withdrawn or coalesced.
     *
     * This value is represented as a fixed point integer with 18 decimals. To normalize this value divide it by 10^18.
     */
    uint256 private _weiPerToken;

    /**
     * A snapshot of the amount of wei per token that a user has redeemed. This value MUST be coalesced when the
     * number of tokens a user has either increases or decreases.
     *
     * These values are represented as a fixed point integer with 18 decimals. To normalize this value divide it
     * by 10^18.
     */
    mapping(address => uint256) private _weiPerTokenSnapshots;

    /**
     * Coalesced dividends are dividends that are accumulated when the amount of a token that a user owns changes. The
     * reason that dust must exist is because the difference of the wei per token and snapshot for the amount of tokens
     * a user had will be wrong when changing the number of tokens they have. For example, if a user decreased the
     * amount of tokens they had and did not dust the dividends then their dividends would appear less than they
     * actually were. Likewise, the opposite would be true.
     */
    mapping(address => uint256) private _coalescedDividends;

    /**
     * @dev The default constructor which initializes the token and sets the ZCI token contract.
     */
    constructor(address zciAddress) public ERC20("0xchan", "ZCH") {
        _zciToken = IERC20(zciAddress);
    }

    /**
     * Purchases tokens.
     */
    function purchase() public payable {
        uint256 amountTokens = toTokens(msg.value);

        _distributeFunds(_msgSender(), msg.value);
        _mint(_msgSender(), amountTokens);
    }

    /**
     * Withdraws all of the dividends that a user has banked.
     */
    function withdraw() public {
        address payable account = _msgSender();
        uint256 dividends = dividendsOf(account);
        require(dividends > 0, "Insufficient dividends");

        // Reset the snapshot entirely and the amount of dust that a user has. Beyond this point the user will be
        // starting with an empty slate and will continue collecting dividends from their tokens that they own.
        _weiPerTokenSnapshots[account] = _weiPerToken;
        _coalescedDividends[account] = 0;

        // Transfer the dividends to the beneficiary.
        account.transfer(dividends);
    }

    /**
     * |WARNING|
     *
     * If you do not want to give out your money out to strangers, do not call this function. I repeat, if
     * you do then you will not get your money back. This function is meant to be used for 0xchan contracts which are
     * distributing payments back to token holders. If you're feeling so nice as to call this AND know what it does,
     * thank you.
     */
    function deposit(bytes4 selector) public payable override returns (bool) {
        require(Address.isContract(msg.sender), "Must be contract");
        require(selector == DEPOSIT_SELECTOR, "Bad selector");

        _distributeFunds(address(0), msg.value);

        emit FundsDeposited(msg.sender, msg.value);

        return true;
    }

    /**
     * Gets the amount of dividends that a user has available to withdraw, measured in wei.
     */
    function dividendsOf(address account) public view returns (uint256) {
        return ((_weiPerToken - _weiPerTokenSnapshots[account]) * balanceOf(account)) / FIXED_POINT_RADIX + _coalescedDividends[account];
    }

    /**
     * @dev Exchanges an allowance of ZCI tokens to mint ZCH up to the amount specified.
     */
    function exchange(uint256 amount) public {
        require(_zciToken.transferFrom(_msgSender(), address(this), amount), "Transfer failed");
        _mint(msg.sender, amount);
    }

    /**
     * @dev Exchanges the entire allowance of ZCI tokens that the calling account has.
     */
    function exchangeAll() public {
        exchange(_zciToken.allowance(_msgSender(), address(this)));
    }

    /**
     * Converts an amount of wei to how many tokens that would be received.
     */
    function toTokens(uint amount) public returns (uint256 tokens) {
        return amount * TOKENS_PER_WEI;
    }

    /**
     * FIXME: Determine if this safe
     */
    function tokenFallback(address from, uint value, bytes memory data) public override {
        require(address(_zciToken) == from, "Token fallback only supported for ZCI");
        _mint(msg.sender, value);
    }

    /**
     * Called before a token transfer occurs. This hook just assures that dividends are coalesced before changing
     * the balances that each user has.
     */
    function _beforeTokenTransfer(address from, address to, uint256 amount) internal override {
        if (from != address(0)) {
            _coalesceDividends(from);
        }
        _coalesceDividends(to);
    }

    /**
     * Coalesces dividends so that the account's wei per token snapshot for an account is up to date.
     */
    function _coalesceDividends(address account) internal {
        uint256 dividends = dividendsOf(account);
        if (dividends > 0) {
            _coalescedDividends[account] += dividends;
        }
        _weiPerTokenSnapshots[account] = _weiPerToken;
    }

    /**
     * Distributes funds deposited into this contract to all current token holders. If the account is set to a non-null
     * value then this will prevent the funds from being distributed to the account.
     */
    function _distributeFunds(address account, uint256 amount) internal {
        if (totalSupply() > 0) {
            uint256 additionalWeiPerToken = (amount * FIXED_POINT_RADIX) / totalSupply();
            _weiPerToken += additionalWeiPerToken;

            if (account != address(0)) {
                _weiPerTokenSnapshots[account] += additionalWeiPerToken;
            }
        }
    }
}