<script setup lang="ts">
defineProps<{
  title: string
  subtitle?: string
  loading?: boolean
  error?: string | null
}>()
</script>

<template>
  <section class="card">
    <header class="card-header">
      <div class="card-heading">
        <h2>{{ title }}</h2>
        <p v-if="subtitle" class="card-subtitle">{{ subtitle }}</p>
      </div>
      <slot name="actions" />
    </header>
    <div v-if="loading" class="card-body card-state">
      <span class="spinner" aria-hidden="true" />
      加载中…
    </div>
    <div v-else-if="error" class="card-body card-state card-state-error">{{ error }}</div>
    <div v-else class="card-body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
}

.card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--color-border);
}

.card-heading h2 {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
}

.card-subtitle {
  margin: 0.15rem 0 0;
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.card-body {
  padding: 1.25rem;
}

.card-state {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  color: var(--color-text-muted);
  font-size: 0.9rem;
}

.card-state-error {
  color: var(--color-danger);
  white-space: pre-wrap;
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
