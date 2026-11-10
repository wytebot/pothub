import React from 'react';
import Head from 'next/head';
import InfoPages from '../src/ui/legal/InfoPages.jsx';
import { INFO_PAGES } from '../src/ui/legal/content.js';

export default function Page() {
  return (<><Head><title>{INFO_PAGES.contact.title} · PotHub</title><meta name="description" content={INFO_PAGES.contact.intro} /><meta name="viewport" content="width=device-width, initial-scale=1" /></Head><InfoPages page="contact" standalone /></>);
}
