"use server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const hex=z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const schema=z.object({
 platformNameAr:z.string().min(2).max(100),platformNameEn:z.string().min(2).max(100),
 taglineAr:z.string().max(200),taglineEn:z.string().max(200),logoUrl:z.string().url().or(z.literal("")).optional(),
 primaryColor:hex,primaryDark:hex,navyColor:hex,accentColor:hex,
 defaultLanguage:z.enum(["AR","EN"]),defaultTheme:z.enum(["light","dark"]),fontScale:z.enum(["small","medium","large"])
});
async function user(){const s=await auth();if(!s?.user?.id)throw new Error("UNAUTHENTICATED");return s.user.id}
export async function getPlatformSettings(){const instructorId=await user();return prisma.platformSettings.upsert({where:{instructorId},update:{},create:{instructorId}})}
export async function savePlatformSettings(_prev:{ok:boolean;error?:string}|null,fd:FormData){const instructorId=await user();const parsed=schema.safeParse(Object.fromEntries(fd));if(!parsed.success)return{ok:false,error:parsed.error.issues[0].message};const d=parsed.data;await prisma.platformSettings.upsert({where:{instructorId},create:{instructorId,...d,logoUrl:d.logoUrl||null},update:{...d,logoUrl:d.logoUrl||null}});revalidatePath("/settings");revalidatePath("/dashboard");return{ok:true}}
