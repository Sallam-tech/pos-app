Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
[Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$caKey=$null; $leafKey=$null; $ca=$null; $leaf=$null
try {
 $m=[Console]::In.ReadToEnd() | ConvertFrom-Json
 if ((($m.PSObject.Properties.Name | Sort-Object) -join ',') -ne 'exponent,modulus') { throw 'Denied' }
 $caKey=[Security.Cryptography.RSACryptoServiceProvider]::new(2048)
 $caKey.PersistKeyInCsp=$false
 $leafKey=[Security.Cryptography.RSACryptoServiceProvider]::new()
 $leafKey.PersistKeyInCsp=$false
 $p=[Security.Cryptography.RSAParameters]::new()
 $p.Modulus=[Convert]::FromBase64String([string]$m.modulus)
 $p.Exponent=[Convert]::FromBase64String([string]$m.exponent)
 if ($p.Modulus.Length -ne 256 -or $p.Exponent.Length -gt 4) { throw 'Denied' }
 $leafKey.ImportParameters($p)
 $hash=[Security.Cryptography.HashAlgorithmName]::SHA256
 $padding=[Security.Cryptography.RSASignaturePadding]::Pkcs1
 $rootRequest=[Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=Shop POS Disposable TEST CA',$caKey,$hash,$padding)
 $rootRequest.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($true,$false,0,$true))
 $rootRequest.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new([Security.Cryptography.X509Certificates.X509KeyUsageFlags]::KeyCertSign,$true))
 $from=[DateTimeOffset]::UtcNow.AddMinutes(-5); $until=[DateTimeOffset]::UtcNow.AddDays(365)
 $ca=$rootRequest.CreateSelfSigned($from,$until.AddDays(1))
 $request=[Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=localhost',$leafKey,$hash,$padding)
 $request.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($false,$false,0,$true))
 $usage=[Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature -bor [Security.Cryptography.X509Certificates.X509KeyUsageFlags]::KeyEncipherment
 $request.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new($usage,$true))
 $san=[Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new()
 $san.AddDnsName('localhost'); $san.AddIpAddress([Net.IPAddress]::Parse('127.0.0.1'))
 $request.CertificateExtensions.Add($san.Build())
 $oid=[Security.Cryptography.OidCollection]::new(); [void]$oid.Add([Security.Cryptography.Oid]::new('1.3.6.1.5.5.7.3.1'))
 $request.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]::new($oid,$true))
 $serial=New-Object byte[] 16; $rng=[Security.Cryptography.RandomNumberGenerator]::Create()
 try {$rng.GetBytes($serial)} finally {$rng.Dispose()}
 $serial[0]=$serial[0] -band 127; $serial[15]=$serial[15] -bor 1
 $leaf=$request.Create($ca,$from,$until,$serial)
 [Console]::Out.Write((@{certificate=[Convert]::ToBase64String($leaf.RawData);trustAnchor=[Convert]::ToBase64String($ca.RawData)} | ConvertTo-Json -Compress))
} catch { [Console]::Out.Write('null'); exit 1 }
finally {if($leaf){$leaf.Dispose()};if($ca){$ca.Dispose()};if($leafKey){$leafKey.Dispose()};if($caKey){$caKey.Dispose()}}
