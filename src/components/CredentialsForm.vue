<template>
  <div class="credentials-form">
    <h2>{{ hasStoredCredentials ? 'Enter Master Password' : 'Set Up Credentials' }}</h2>

    <div v-if="error" class="error-message">
      {{ error }}
    </div>

    <form @submit.prevent="handleSubmit">
      <!-- Master password field (always shown) -->
      <div class="form-group">
        <label for="masterPassword">Master Password:</label>
        <input
          id="masterPassword"
          v-model="masterPassword"
          type="password"
          required
          placeholder="Enter a secure master password"
          class="input"
        />
        <small v-if="!hasStoredCredentials">
          This password will be used to encrypt your credentials. Make sure to remember it!
        </small>
      </div>

      <!-- Credential fields (only shown when setting up or updating) -->
      <div v-if="!hasStoredCredentials || isEditMode" class="credentials-fields">
        <div class="form-group">
          <label for="username">SurrealDB Username:</label>
          <input
            id="username"
            v-model="formData.username"
            type="text"
            required
            placeholder="Enter your SurrealDB username"
            class="input"
          />
        </div>

        <div class="form-group">
          <label for="password">SurrealDB Password:</label>
          <input
            id="password"
            v-model="formData.password"
            type="password"
            required
            placeholder="Enter your SurrealDB password"
            class="input"
          />
        </div>

        <div class="form-group">
          <label for="decryptionPassword">OwnTracks Decryption Password:</label>
          <input
            id="decryptionPassword"
            v-model="formData.decryptionPassword"
            type="password"
            required
            placeholder="Enter your OwnTracks decryption password"
            class="input"
          />
        </div>
      </div>

      <div class="form-actions">
        <button
          type="submit"
          class="btn btn-primary"
          :disabled="isLoading"
        >
          {{ submitButtonText }}
        </button>

        <button
          v-if="hasStoredCredentials && !isEditMode"
          type="button"
          class="btn btn-secondary"
          @click="toggleEditMode"
        >
          Edit Credentials
        </button>

        <button
          v-if="hasStoredCredentials"
          type="button"
          class="btn btn-danger"
          @click="handleClearCredentials"
        >
          Clear Stored Credentials
        </button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useCredentialsStore } from '../stores/credentials'

const credentialsStore = useCredentialsStore()

const props = defineProps<{
  onSuccess?: () => void
}>()

const emit = defineEmits<{
  (e: 'success'): void
}>()

const masterPassword = ref('')
const isLoading = ref(false)
const error = ref('')
const isEditMode = ref(false)

const formData = ref({
  username: '',
  password: '',
  decryptionPassword: ''
})

const hasStoredCredentials = computed(() => {
  return credentialsStore.hasStoredCredentials()
})

const submitButtonText = computed(() => {
  if (isLoading.value) return 'Processing...'
  if (!hasStoredCredentials.value) return 'Save Credentials'
  if (isEditMode.value) return 'Update Credentials'
  return 'Unlock'
})

// Try to load existing credentials if they exist
onMounted(() => {
  if (credentialsStore.isLoaded) {
    // If credentials are already loaded in memory, use them
    formData.value = { ...credentialsStore.credentials }
  }
})

const handleSubmit = async () => {
  error.value = ''
  isLoading.value = true

  try {
    if (!hasStoredCredentials.value || isEditMode.value) {
      // Save new credentials
      const success = await credentialsStore.saveCredentials(formData.value, masterPassword.value)

      if (success) {
        isEditMode.value = false
        if (props.onSuccess) props.onSuccess()
        emit('success')
      } else {
        error.value = credentialsStore.error || 'Failed to save credentials'
      }
    } else {
      // Try to unlock existing credentials
      const success = await credentialsStore.loadCredentials(masterPassword.value)

      if (success) {
        // Update form data with loaded credentials
        formData.value = { ...credentialsStore.credentials }
        if (props.onSuccess) props.onSuccess()
        emit('success')
      } else {
        error.value = credentialsStore.error || 'Failed to unlock credentials'
      }
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'An unexpected error occurred'
  } finally {
    isLoading.value = false
  }
}

const toggleEditMode = () => {
  isEditMode.value = !isEditMode.value

  if (isEditMode.value && credentialsStore.isLoaded) {
    // Load current values into form
    formData.value = { ...credentialsStore.credentials }
  }
}

const handleClearCredentials = () => {
  if (confirm('Are you sure you want to clear all stored credentials? This cannot be undone.')) {
    credentialsStore.clearCredentials()
    formData.value = {
      username: '',
      password: '',
      decryptionPassword: ''
    }
    masterPassword.value = ''
    isEditMode.value = false
  }
}
</script>

<style scoped>
.credentials-form {
  max-width: 500px;
  margin: 0 auto;
  padding: 20px;
  background: #f8f9fa;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

h2 {
  margin-top: 0;
  margin-bottom: 20px;
  color: #333;
  text-align: center;
}

.form-group {
  margin-bottom: 15px;
}

.form-group label {
  display: block;
  margin-bottom: 5px;
  font-weight: bold;
}

.input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

small {
  display: block;
  margin-top: 5px;
  color: #6c757d;
  font-size: 12px;
}

.form-actions {
  display: flex;
  gap: 10px;
  margin-top: 20px;
  flex-wrap: wrap;
}

.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.2s;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  background-color: #007bff;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background-color: #0056b3;
}

.btn-secondary {
  background-color: #6c757d;
  color: white;
}

.btn-secondary:hover:not(:disabled) {
  background-color: #545b62;
}

.btn-danger {
  background-color: #dc3545;
  color: white;
}

.btn-danger:hover:not(:disabled) {
  background-color: #c82333;
}

.error-message {
  background-color: #f8d7da;
  color: #721c24;
  padding: 10px;
  border-radius: 4px;
  margin-bottom: 15px;
}

.credentials-fields {
  border-top: 1px solid #ddd;
  margin-top: 15px;
  padding-top: 15px;
}
</style>
