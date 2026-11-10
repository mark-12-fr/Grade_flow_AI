/** Home: sends the visitor straight to the upload page. */
import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/upload');
}
