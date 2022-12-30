// For some reason ts-node cannot see the global fetch, so I use this in place
import fetch from 'node-fetch';

const API_KEY = 'b6913686ac08f3e7bc5e90869371';

interface PageVisitEvent {
  url: string;
  visitorId: string;
  timestamp: number;
}

interface Session {
  duration: number;
  pages: PageVisitEvent['url'][];
  startTime: PageVisitEvent['timestamp'];
}

interface Input {
  events: PageVisitEvent[];
}

interface Output {
  sessionByUser: Record<PageVisitEvent['visitorId'], Session[]>;
}

const getData = async () => {
  const res = await fetch(`https://candidate.hubteam.com/candidateTest/v3/problem/dataset?userKey=${API_KEY}`);
  const json = (await res.json()) as Input;
  return json;
};

const postData = async (result: object) => {
  try {
    const res = await fetch(`https://candidate.hubteam.com/candidateTest/v3/problem/result?userKey=${API_KEY}`, {
      method: 'POST',
      body: JSON.stringify(result),
    });
    if (res.status === 200) return true;
    return false;
  } catch (err) {
    console.error(err);
    return false;
  }
};

const compare = (a: PageVisitEvent, b: PageVisitEvent) => {
  let timestampA = a.timestamp;
  let timestampB = b.timestamp;

  if (timestampA > timestampB) return 1;
  if (timestampA < timestampB) return -1;
  return 0;
};

const buildSession = (input: Input): Output => {
  // first group events by visitor
  // then sort events per visitor by timestamp
  // then iterate through the events bucket and fold into groups
  // folding into group:
  // - fold into new group if gap is more than 10 minute
  // - increases the duration by the difference between the previous event and current event
  // - add the page into the page list

  // step 1: group events by visitor
  const TEN_MINUTES = 10 * 60 * 1000;
  const groupedByVisitor = input.events.reduce((acc, next) => {
    acc.set(next.visitorId, (acc.get(next.visitorId) ?? []).concat(next));
    return acc;
  }, new Map() as Map<PageVisitEvent['visitorId'], PageVisitEvent[]>);

  // step 2: fold into group
  const result: Record<PageVisitEvent['visitorId'], Session[]> = {};

  for (let [visitorId, events] of groupedByVisitor.entries()) {
    events.sort(compare);
    const groups: Session[] = [];
    let buffer: PageVisitEvent[] = [];

    for (let event of events) {
      if (!buffer.length) buffer.push(event);
      else {
        const lastInBuffer = buffer[buffer.length - 1];
        if (event.timestamp - lastInBuffer.timestamp > TEN_MINUTES) {
          // groups events in buffer into a session
          const newSession = {
            duration: lastInBuffer.timestamp - buffer[0].timestamp,
            pages: buffer.map(e => e.url),
            startTime: buffer[0].timestamp,
          };
          groups.push(newSession);
          buffer = [event];
        } else {
          buffer.push(event);
        }
      }
    }
    // buffer flusing at the end
    if (buffer.length) {
      groups.push({
        duration: buffer[buffer.length - 1].timestamp - buffer[0].timestamp,
        pages: buffer.map(e => e.url),
        startTime: buffer[0].timestamp,
      });
    }

    result[visitorId] = groups;
  }

  return { sessionByUser: result };
};

async function main() {
  try {
    const input: Input = await getData();
    const output = buildSession(input);

    const result = await postData(output);
    if (result) {
      console.log('Code accepted!');
    } else {
      console.log('Code was rejected. Output was', output);
    }
  } catch (err) {
    console.error('Some error happened', err);
  }
}

main();
