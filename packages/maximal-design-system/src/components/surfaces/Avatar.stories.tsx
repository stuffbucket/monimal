import type { Meta, StoryObj } from '@storybook/react-vite'

import '../../styles/index.css'
import { Avatar } from './index'

const avatarImage = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <rect width="64" height="64" fill="#d8dee9"/>
    <circle cx="32" cy="24" r="12" fill="#4c566a"/>
    <path d="M12 62c2-15 10-23 20-23s18 8 20 23" fill="#4c566a"/>
  </svg>
`)}`

const meta = {
  title: 'Components/Avatar',
  component: Avatar,
  globals: { shell: 'design-system' },
  args: {
    alt: 'Maximal account',
  },
} satisfies Meta<typeof Avatar>

export default meta
type Story = StoryObj<typeof meta>

export const Fallback: Story = {
  args: {
    fallback: 'MA',
  },
}

export const Image: Story = {
  args: {
    alt: 'Abstract profile',
    src: avatarImage,
  },
}
