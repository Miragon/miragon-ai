#!/usr/bin/env tsx
/**
 * Seed script for generating test data against a running Camunda 7 / CIB Seven engine.
 *
 * Usage:
 *   npx tsx packages/camunda7-mcp-server/scripts/seed.ts [--count 100] [--completed-ratio 0.7] [--base-url http://localhost:8080/engine-rest]
 */

import { createEngineAdapter } from '@camunda7-mcp/engine-adapter';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    count: { type: 'string', default: '100' },
    'completed-ratio': { type: 'string', default: '0.7' },
    'base-url': { type: 'string', default: 'http://localhost:8080/engine-rest' },
    'engine-type': { type: 'string', default: 'cibseven' },
    username: { type: 'string', default: 'demo' },
    password: { type: 'string', default: 'demo' },
  },
});

const count = parseInt(values.count!, 10);
const completedRatio = parseFloat(values['completed-ratio']!);
const baseUrl = values['base-url']!;
const engineType = values['engine-type'] as 'camunda7' | 'cibseven' | 'operaton';
const username = values.username!;
const password = values.password!;

const adapter = createEngineAdapter({
  engineType,
  baseUrl,
  authType: 'basic',
  username,
  password,
});

const applicants = [
  'John Smith', 'Jane Doe', 'Alice Johnson', 'Bob Williams', 'Charlie Brown',
  'Diana Prince', 'Edward Norton', 'Fiona Apple', 'George Lucas', 'Hannah Montana',
  'Ivan Petrov', 'Julia Roberts', 'Kevin Hart', 'Laura Palmer', 'Michael Scott',
];

const loanTypes = ['personal', 'mortgage', 'auto', 'business', 'student', 'home-equity'];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min)) + min;
}

async function seed() {
  const completedCount = Math.floor(count * completedRatio);

  console.log(`Seeding ${count} process instances (${(completedRatio * 100).toFixed(0)}% completed)...`);
  console.log(`Engine: ${engineType} at ${baseUrl}`);

  for (let i = 1; i <= count; i++) {
    const amount = randInt(1_000, 500_000);
    const applicant = pick(applicants);
    const loanType = pick(loanTypes);
    const approved = Math.random() < 0.6;

    const instance = await adapter.startProcessInstance('loanApproval', {
      variables: {
        amount: { value: amount, type: 'Integer' },
        applicant: { value: applicant, type: 'String' },
        loanType: { value: loanType, type: 'String' },
      },
    });

    if (i <= completedCount) {
      // Complete "Check the request" task
      const tasks = await adapter.listTasks({
        processInstanceId: instance.id,
        taskDefinitionKey: 'Task_0dfv74n',
      });

      if (tasks.length > 0) {
        await adapter.completeTask(tasks[0].id, {
          approved: { value: approved, type: 'Boolean' },
        });

        if (approved) {
          // Randomly complete some "Prepare Bank Transfer" tasks
          if (Math.random() < 0.5) {
            const bankTasks = await adapter.listTasks({
              processInstanceId: instance.id,
              taskDefinitionKey: 'Task_bankTransfer',
            });
            if (bankTasks.length > 0) {
              await adapter.claimTask(bankTasks[0].id, 'demo');
              await adapter.completeTask(bankTasks[0].id);
            }
          }
        }
        // Rejected flow: delegate executes synchronously, instance already completed
      }
    }

    if (i % 25 === 0) {
      console.log(`  Seeded ${i}/${count} instances...`);
    }
  }

  console.log(`\nSeeding complete. Created ${count} instances (${completedCount} targeted for completion).`);
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
