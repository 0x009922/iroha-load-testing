<script setup lang="ts">
import { connect, state } from './state'
import { computed, onMounted } from 'vue'
import * as R from 'remeda'

const messages = computed(() => {
  return R.reverse(state.messages.slice(-25))
})

function formatDate(iso: string) {
  return iso.split('T')[1].slice(0, -1)
}

onMounted(() => connect())
</script>

<template>
  <div v-if="state.connected" class="flex items-start gap-4 font-mono p-4">
    <div class="border border-solid border-gray-300 rounded min-w-max">
      <div v-for="x in state.peers" class="flex flex-col space-y-1 p-2">
        <span
          :class="{ 'bg-green-400': x.running, 'bg-red-400': !x.running }"
          class="text-lg px-2 font-bold"
        >{{ x.name }}</span>
        <div class="info">
          <span>Blocks</span>
          <span>{{ x.blocks }}</span>
        </div>
        <div class="info">
          <span>Transactions accepted</span>
          <span>{{ x.transactions.accepted }}</span>
        </div>
        <div class="info">
          <span>Transactions rejected</span>
          <span>{{ x.transactions.rejected }}</span>
        </div>
        <div class="info">
          <span>Queue</span>
          <span>{{ x.queue }}</span>
        </div>
        <div class="info">
          <span>Blocks</span>
          <span>{{ x.blocks }}</span>
        </div>
      </div>
    </div>
    <div class="text-xs space-y-2">
      <div v-for="msg in messages" :key="msg.date + msg.msg" class="flex gap-2">
        <span class="opacity-60">{{ formatDate(msg.date) }}</span>
        <span>{{ msg.msg }}</span>
      </div>
    </div>
  </div>
  <span v-else>Disconnected</span>
</template>

<style lang="css" scoped>
.info {
  display: flex;
  align-items: center;
  gap: 4rem;
}

.info span:first-child {}
</style>
