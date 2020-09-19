import RingCentral from '@rc-ex/core';
import RateLimitExtension from '@rc-ex/rate-limit';
import {CompanyPhoneNumberInfo} from '@rc-ex/core/lib/definitions';
import papaparse from 'papaparse';
import fs from 'fs';
import path from 'path';

const rc = new RingCentral({
  server: process.env.RINGCENTRAL_SERVER_URL!,
});
rc.token = {access_token: process.env.RINGCENTRAL_ACCESS_TOKEN};
const rateLimitExtension = new RateLimitExtension();
rc.installExtension(rateLimitExtension);

const numbers = new Set(
  process.env.RINGCENTRAL_PHONE_NUMBERS!.split(',').map(n => `+1${n}`)
);
let phoneNumbers: CompanyPhoneNumberInfo[] = [];
const result: {
  id: string;
  direction: string;
  from: string;
  to: string;
  messageStatus: string;
  extensionId: string;
  creationTime: string;
  lastModifiedTime: string;
}[] = [];

(async () => {
  // find all matching numbers in this account
  let page = 1;
  let totalPage = 1;
  while (page <= totalPage) {
    const r = await rc
      .restapi()
      .account()
      .phoneNumber()
      .list({perPage: 1000, page});
    phoneNumbers = [
      ...phoneNumbers,
      ...r.records!.filter(record => numbers.has(record.phoneNumber ?? '')),
    ];
    totalPage = r.paging!.totalPages!;
    page += 1;
  }

  // fetch SMS
  for (const phoneNumber of phoneNumbers) {
    const r = await rc
      .restapi()
      .account()
      .extension(phoneNumber.extension!.id!)
      .messageStore()
      .list({messageType: ['SMS']});
    for (const record of r.records!) {
      result.push({
        id: record.id!.toString(),
        direction: record.direction!,
        from: record.from?.phoneNumber ?? record.from?.extensionNumber ?? '',
        to:
          record.to
            ?.map(pn => pn.phoneNumber ?? pn.extensionNumber)
            .join(' & ') ?? '',
        messageStatus: record.messageStatus!,
        extensionId: phoneNumber.extension!.id!,
        creationTime: record.creationTime!,
        lastModifiedTime: record.lastModifiedTime!,
      });
    }
  }

  const csvString = papaparse.unparse(result);
  fs.writeFileSync(path.join(__dirname, 'result.csv'), csvString);
})();
