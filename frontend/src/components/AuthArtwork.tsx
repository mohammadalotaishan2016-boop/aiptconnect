import Image from 'next/image';

export function AuthArtwork() {
  return (
    <aside className="auth-artwork" aria-label="AIP&T global reach">
      <Image
        className="auth-artwork-image"
        src="/images/auth-global-reach.webp"
        alt="AIP&T global office network, with its main office in Egypt and branch office in Saudi Arabia"
        width={1671}
        height={941}
        sizes="(max-width: 900px) 1px, 65vw"
        quality={82}
        loading="lazy"
        unoptimized
        decoding="async"
      />
    </aside>
  );
}
