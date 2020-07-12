import chai from "chai";
import { deployContract, solidity } from "ethereum-waffle";

import AnnsArtifact from "../artifacts/ZchAnns.json";
import { ZchAnns } from "../types/ethers-contracts/ZchAnns"
import { ethers } from "@nomiclabs/buidler";
import { Signer } from "ethers";

chai.use(solidity);

const { expect } = chai;

describe("ZchAnns", () => {
    const ANNOUNCEMENT_HASH: string = "0x6e44a07a9543467fd2894c29258bc5a97dcfc9db43dd9c922cf9d48cab04bcc1";

    let announcements: ZchAnns;

    let owner: Signer;
    let accounts: Signer[];

    beforeEach(async () => {
        [owner, ...accounts] = await ethers.getSigners();

        announcements = await deployContract(owner, AnnsArtifact, []) as ZchAnns;

        expect(await announcements.owner()).to.equal(await owner.getAddress());
    });

    describe("Ownership", async () => {
        it("Allows the owner to be transferred", async () => {
            let [newOwner] = accounts;

            await announcements.transferOwnership(await newOwner.getAddress());
            expect(await announcements.owner()).to.equal(await newOwner.getAddress());
        });

        it("Only allows the owner to transfer ownership", async () => {
            let [notOwner, newOwner] = accounts;

            await expect(
                announcements.connect(notOwner).transferOwnership(await newOwner.getAddress())
            ).to.be.revertedWith("You are not the owner");
        });

        it("Emits an event when the owner is transferred", async () => {
            let [newOwner] = accounts;

            expect(announcements.transferOwnership(await newOwner.getAddress()))
                .to.emit(announcements, "OwnershipTransferred")
                .withArgs(await owner.getAddress(), await newOwner.getAddress());
        });
    });

    describe("Whitelist", async () => {
        it("Allows for addresses to be whitelisted", async () => {
            let [whitelisted] = accounts;

            await announcements.whitelist(await whitelisted.getAddress());
            expect(await announcements.announcers(await whitelisted.getAddress())).to.be.true;
        });

        it("Only allows the owner to whitelist", async () => {
            let [notOwner, whitelisted] = accounts;

            await expect(
                announcements.connect(notOwner).whitelist(await whitelisted.getAddress())
            ).to.be.revertedWith("You are not the owner");
        });

        it("Emits an event when a new account is whitelisted", async () => {
            let [whitelisted] = accounts;

            expect(announcements.whitelist(await whitelisted.getAddress()))
                .to.emit(announcements, "AnnouncerWhitelisted")
                .withArgs(await whitelisted.getAddress());
        });

        it("Only allows an account to be whitelisted once", async () => {
            let [whitelisted] = accounts;

            await announcements.whitelist(await whitelisted.getAddress());
            expect(await announcements.announcers(await whitelisted.getAddress())).to.be.true;

            await expect(
                announcements.whitelist(await whitelisted.getAddress())
            ).to.be.revertedWith("Already whitelisted");
        });


        it("Allows for whitelisted addresses to become blacklisted", async () => {
            let [whitelisted] = accounts;

            await announcements.whitelist(await whitelisted.getAddress());
            await announcements.blacklist(await whitelisted.getAddress());
            expect(await announcements.announcers(await whitelisted.getAddress())).to.be.false;
        });

        it("Emits an event when a whitelisted account is blacklisted", async () => {
            let [whitelisted] = accounts;

            await announcements.whitelist(await whitelisted.getAddress());

            expect(announcements.blacklist(await whitelisted.getAddress()))
                .to.emit(announcements, "AnnouncerBlacklisted")
                .withArgs(await whitelisted.getAddress());
        });

        it("Only allows the owner to blacklist", async () => {
            let [notOwner, whitelisted] = accounts;

            await announcements.whitelist(await whitelisted.getAddress());

            await expect(
                announcements.connect(notOwner).blacklist(await whitelisted.getAddress())
            ).to.be.revertedWith("You are not the owner");
        });

        it("Only allows an account to be blacklisted once", async () => {
            let [whitelisted] = accounts;

            await announcements.whitelist(await whitelisted.getAddress());
            await announcements.blacklist(await whitelisted.getAddress());

            await expect(
                announcements.blacklist(await whitelisted.getAddress())
            ).to.be.revertedWith("Already blacklisted");
        });
    });

    describe("Publishing", async () => {
        it("Allows the owner to publish announcements", async () => {
            await announcements.publishAnnouncement(ANNOUNCEMENT_HASH);

            expect(await announcements.announcementCount()).to.equal(1);

            const { author, hash } = await announcements.announcements(1);
            expect(author).to.equal(await owner.getAddress());
            expect(hash).to.equal(ANNOUNCEMENT_HASH);
        });

        it("Emits an event when an announcement is published", async () => {
            await expect(announcements.publishAnnouncement(ANNOUNCEMENT_HASH))
                .to.emit(announcements, "AnnouncementPublished")
                .withArgs(await owner.getAddress(), ANNOUNCEMENT_HASH);
        });

        it("Allows whitelisted accounts to publish announcements", async () => {
            let [announcer] = accounts;

            await announcements.whitelist(await announcer.getAddress());
            expect(await announcements.announcers(await announcer.getAddress())).to.be.true;

            await announcements.connect(announcer).publishAnnouncement(ANNOUNCEMENT_HASH);

            expect(await announcements.announcementCount()).to.equal(1);

            const { author, hash } = await announcements.announcements(1);
            expect(author).to.equal(await announcer.getAddress());
            expect(hash).to.equal(ANNOUNCEMENT_HASH);
        });
    });
});
