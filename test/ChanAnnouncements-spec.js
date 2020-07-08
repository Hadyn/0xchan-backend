/*global artifacts, contract, it*/

const ChanAnnouncements = artifacts.require('ChanAnnouncements');

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
      ChanAnnouncements: { args: [] }
    }
  }
}, (_err, web3_accounts) => {
  accounts = web3_accounts
});

contract("ChanAnnouncements", function () {
  it("should set the owner to be the deployer", async function () {
    const owner = await ChanAnnouncements.methods.owner().call();
    assert.strictEqual(owner, accounts[0]);
  });

  it("should allow the owner to be transferred", async function() {
    const transaction = await ChanAnnouncements.methods.transferOwnership(accounts[1]).send();
    assert.eventEmitted(transaction, 'OwnershipTransferred', {_previousOwner: accounts[0], _newOwner: accounts[1]});

    const newOwner = await ChanAnnouncements.methods.owner().call();
    assert.strictEqual(newOwner, accounts[1]);
  });

  it("should deny the owner to be transferred if the account is not the current owner", async function () {
    await assert.reverts(
        ChanAnnouncements.methods.transferOwnership(accounts[2]),
        { from: accounts[0] },
        "Returned error: VM Exception while processing transaction: revert You are not the owner"
    );
  });

  it("should whitelist accounts to post announcements", async function() {
      const transaction = await ChanAnnouncements.methods.whitelist(accounts[2]).send({ from: accounts[1] });
      assert.eventEmitted(transaction, 'AnnouncerWhitelisted', {_address: accounts[2]});

      const status = await ChanAnnouncements.methods.announcers(accounts[2]).call();
      assert.strictEqual(status, true);
  });

  it("should only allow the owner to whitelist", async function() {
    await assert.reverts(
        ChanAnnouncements.methods.whitelist(accounts[2]),
        { from: accounts[0] },
        "Returned error: VM Exception while processing transaction: revert You are not the owner"
    );
  });

  it("should reject whitelisting accounts twice", async function() {
    await ChanAnnouncements.methods.whitelist(accounts[3]).send({ from: accounts[1] });
    await assert.reverts(
        ChanAnnouncements.methods.whitelist(accounts[3]),
        { from: accounts[1] },
        "Returned error: VM Exception while processing transaction: revert Already whitelisted"
    );
  });

  it("should blacklist whitelisted accounts", async function() {
    await ChanAnnouncements.methods.whitelist(accounts[4]).send({ from: accounts[1] });
    const transaction = await ChanAnnouncements.methods.blacklist(accounts[4]).send({ from: accounts[1] });
    assert.eventEmitted(transaction, 'AnnouncerBlacklisted', {_address: accounts[4]});

    const status = await ChanAnnouncements.methods.announcers(accounts[4]).call();
    assert.strictEqual(status, false);
  });

  it("should only allow the owner to blacklist", async function() {
    await assert.reverts(
        ChanAnnouncements.methods.blacklist(accounts[5]),
        { from: accounts[0] },
        "Returned error: VM Exception while processing transaction: revert You are not the owner"
    );
  });

  it("should reject blacklisting accounts twice", async function() {
    await ChanAnnouncements.methods.whitelist(accounts[6]).send({ from: accounts[1] });
    await ChanAnnouncements.methods.blacklist(accounts[6]).send({ from: accounts[1] });
    await assert.reverts(
        ChanAnnouncements.methods.blacklist(accounts[6]),
        { from: accounts[1] },
        "Returned error: VM Exception while processing transaction: revert Already blacklisted"
    );
  });

  it("should publish announcements", async function() {
    await mineAtTimestamp(5);

    const transaction = await ChanAnnouncements.methods.publishAnnouncement("0x000100").send({ from: accounts[2] });
    assert.eventEmitted(transaction, 'AnnouncementPublished', {_author: accounts[2], _multihash: "0x000100", _timestamp: "5" });

    const announcementCount = await ChanAnnouncements.methods.announcementCount().call();
    assert.strictEqual(parseInt(announcementCount, 10), 1);
  });

  it("should fetch announcements", async function() {
    const announcement = await ChanAnnouncements.methods.announcements(1).call();
    assert.strictEqual(announcement.author, accounts[2]);
    assert.strictEqual(announcement.multihash, "0x000100");
    assert.strictEqual(announcement.timestamp, "5");
  });

  it("should fetch the latest announcement", async function() {
    const announcement = await ChanAnnouncements.methods.getLatestAnnouncement().call();
    assert.strictEqual(announcement.author, accounts[2]);
    assert.strictEqual(announcement.multihash, "0x000100");
    assert.strictEqual(announcement.timestamp, "5");
  });
});
