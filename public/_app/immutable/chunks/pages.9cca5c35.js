const e=`# Server Shutdown Incident (1/21/2025)\r
On January 21st of 2025, we lost access to our own servers potentially deleting over 3 thousand projects and 10 thousand accounts.\r
\r
This post is meant to explain what happened before we lost access, what actually happened, what we did wrong, and what our third-party server provider did.\r
\r
PenguinMod Projects that you have saved to your computer were not directly affected by this outage.\r
Restore points in the PenguinMod editor were also not affected.\r
\r
## Our setup\r
*Technical detail:*\r
Our project servers are written in [Node.js](https://nodejs.org/), holding account and project info in a [MongoDB](https://www.mongodb.com/) database and project data in [MinIO](https://min.io/) buckets.\r
This gave us a stable setup for the servers that we could maintain for a long time.\r
\r
*Technical detail:*\r
The project servers at this time were hosted on [Oracle](https://www.oracle.com/), using a free-tier Oracle account.\r
\r
## What (likely) caused the outage?\r
On January 18th, we were attempting to setup and put project assets (costumes, sounds, etc) onto [Backblaze](https://www.backblaze.com/) since we were reaching limits on our server's storage.\r
\r
This process did complete and on the 20th, assets for PenguinMod projects were on Backblaze.\r
However, the process did strain a lot of the server's CPU (the server was very slow), and used a lot of network bandwidth.\r
\r
*Technical detail:*\r
It also turned out that the majority of the server's space (over 60 gigabytes) was not actually used by PenguinMod projects, but by Docker logs of what the server was doing.\r
\r
## Server Outage\r
The next day, January 21st, we could no longer connect to the PenguinMod projects server.\r
\r
Ianyourgod (PenguinMod server developer) could not connect to the live PenguinMod server, could not login to our Oracle account, and the PenguinMod server refused connections from any source.\r
\r
*Technical detail:*\r
We also could not SSH into the server directly anymore. The connections would be refused.\r
\r
Our belief is that due to our free-tier Oracle account, we were not supposed to be sending large amounts of data to our Backblaze storage at the speed we were doing it at.\r
\r
*Technical detail:*\r
The traffic was around 32 gigabytes of data.\r
\r
## Contacting Oracle support\r
**This section is only for transparency on what we tried, and not for harrassment.** Do not contact Oracle for anything related to PenguinMod.\r
\r
Due to the use of the free-tier Oracle servers, we didn't have any direct contact or priority with Oracle.\r
\r
We sent multiple emails they responded to only once, asking our use-case and nothing more. Our follow-up was not seen.\r
\r
We also did not manage to get any of our calls answered, they simply hung up after a short hold time.\r
\r
## Our Responsibility\r
PenguinMod is not liable for any loss of data, but we still should have setup backups for your accounts & projects before anything like this could have happened.\r
We also now understand that hosting a large project like this one should not have been done on a free service.\r
\r
Since this incident, we have moved from using free-tier accounts and are now spending money on a Virtual Private Server.\r
*Thank you to everyone who has donated so far! :D*\r
\r
We can't guarantee nothing will be lost like this again, but we have setup everything to where it should be impossible.\r
\r
Thank you for reading this page. We will support our new servers and your projects as best as we can from now on.\r
`,n={"3-18-2025-shutdown-incident":e};export{n as D};
