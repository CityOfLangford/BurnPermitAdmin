/**
Name    : colsp_UpdatePermit
Date    : August 25, 2026
Author  : Ted Corpus
Purpose : Updates editable permit details
Notes   : PermitNumber and ApplicationDate are not changed.
**/
CREATE OR ALTER PROCEDURE [dbo].[colsp_UpdatePermit]
 @permitID       int
,@streetNumber   nvarchar(10)
,@streetName     nvarchar(100)
,@firstName      nvarchar(50)
,@lastName       nvarchar(50)
,@phoneNumber    nvarchar(20)
,@email          nvarchar(255)
,@permitDate     datetime
,@permitStatus   int
,@typeID         int
,@periodID       int
,@permitStartTime int = NULL
,@permitEndTime   int = NULL
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE [dbo].[Permits]
    SET
        [StreetNumber] = @streetNumber
       ,[StreetName] = @streetName
       ,[FirstName] = @firstName
       ,[LastName] = @lastName
       ,[PhoneNumber] = @phoneNumber
       ,[Email] = @email
       ,[PermitDate] = @permitDate
       ,[PermitStatus] = @permitStatus
       ,[TypeID] = @typeID
    ,[PeriodID] = @periodID
    ,[PermitStartTime] = @permitStartTime
    ,[PermitEndTime] = @permitEndTime
    WHERE
        [PermitID] = @permitID;
END
GO
